import {PDFDocument, StandardFonts, rgb} from 'pdf-lib';
import {FINDING_CATEGORIES, READING_STATES, RESPONSE_STATES, equipmentProgress, inspectionProgress, highestPriority, hasValue} from './inspectionModel.js';

// Preserve unsupported characters explicitly; the original strings remain in JSON.
const printable = value => String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').replace(/\t/g, ' ').replace(/[^\x00-\x7f\xa0-\xff€•–—‘’“”…™]/gu, c => `[U+${c.codePointAt(0).toString(16).toUpperCase()}]`);
const recorded = value => hasValue(value) ? String(value) : 'Not recorded';
const unit = value => value === 'F' ? '°F' : value === 'C' ? '°C' : value;
const measured = r => r.state === 'measured' ? `${r.value} ${unit(r.unit)}` : READING_STATES[r.state] || recorded(r.state);
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? `${value.slice(5, 7)}/${value.slice(8)}/${value.slice(0, 4)}` : recorded(value);
const compactMissing = value => hasValue(value) ? String(value) : '—';
const withAmps = value => hasValue(value) ? (/\bA$/i.test(String(value).trim()) ? String(value) : `${value} A`) : '—';

export async function inspectionPdf({inspectionNumber, document, revision = null, photos = [], logoBytes = null}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const titleFont = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const logo = logoBytes ? await pdf.embedPng(logoBytes) : null;
  const stamp = new Date(revision?.issued_at || '2000-01-01T00:00:00Z');
  pdf.setCreationDate(stamp); pdf.setModificationDate(stamp);
  pdf.setTitle(`${inspectionNumber} Electrical Inspection Report`);
  pdf.setAuthor('Northgate Electrical'); pdf.setProducer('Northgate Inspection Renderer 1');

  const margin = 40, width = 532, red = rgb(.67, .07, .15), ink = rgb(.16, .17, .19);
  const muted = rgb(.39, .4, .43), rule = rgb(.81, .82, .83), tint = rgb(.97, .97, .97);
  const pages = [];
  let page, y, context = null;

  // PDF text operators use unkerned advances; measure the same way to keep edges exact.
  const advance = (value, size, font = regular) => [...printable(value)].reduce((n, c) => n + font.widthOfTextAtSize(c, size), 0);
  function wrap(value, maxWidth = width, size = 9, font = regular) {
    const lines = [];
    for (const paragraph of printable(value).split('\n')) {
      let row = '';
      for (let word of paragraph.split(/\s+/).filter(Boolean)) {
        if (row && advance(`${row} ${word}`, size, font) > maxWidth) { lines.push(row); row = ''; }
        while (advance(word, size, font) > maxWidth) {
          let count = 1;
          while (count < word.length && advance(word.slice(0, count + 1), size, font) <= maxWidth) count++;
          lines.push(word.slice(0, count)); word = word.slice(count);
        }
        row = row ? `${row} ${word}` : word;
      }
      lines.push(row);
    }
    return lines;
  }
  const draw = (value, x, top, size = 9, font = regular, color = ink) => page.drawText(printable(value), {x, y: top - size, size, font, color});
  const line = (top, color = rule, thickness = .5) => page.drawLine({start: {x: margin, y: top}, end: {x: margin + width, y: top}, thickness, color});
  const footerText = `${inspectionNumber}  |  ${revision ? `Issued revision ${revision.revision}` : 'Draft - not issued'}`;
  const footerLines = wrap(footerText, width - 80, 7);
  const bottom = Math.max(62, 40 + footerLines.length * 9);
  function short(value, maxWidth, size = 8) {
    let text = printable(value).replace(/\s+/g, ' ');
    if (advance(text, size) <= maxWidth) return text;
    while (text && advance(text + '…', size) > maxWidth) text = text.slice(0, -1);
    return text + '…';
  }
  function addPage(equipment = context) {
    context = equipment;
    page = pdf.addPage([612, 792]); pages.push(page);
    if (logo) {
      const scale = Math.min(145 / logo.width, 53 / logo.height);
      page.drawImage(logo, {x: margin - 7, y: 731, width: logo.width * scale, height: logo.height * scale});
    } else {
      draw('Northgate', margin, 757, 26, titleFont, red);
      draw('E L E C T R I C A L', margin + 3, 726, 8, bold, muted);
    }
    const header = [
      equipment ? `Equipment: ${recorded(equipment.designator)}` : `Client: ${recorded(document.client.clientName)}`,
      equipment ? `Visit: ${date(equipment.visitDate)}  ${equipment.visitTime || ''}` : `Job: ${recorded(document.client.jobNumber)}`,
      revision ? `Issued revision ${revision.revision}` : 'DRAFT - NOT ISSUED',
    ];
    header.forEach((text, i) => {
      const value = short(text, 275);
      draw(value, margin + width - advance(value, 8), 756 - i * 13, 8, regular, i === 2 ? red : ink);
    });
    draw(equipment ? 'ELECTRICAL EQUIPMENT INSPECTION' : 'ELECTRICAL INSPECTION REPORT', margin, 708, 17, titleFont, red);
    line(684, red, 1.5); y = 673;
  }
  function ensure(height) { if (!page || y - height < bottom) addPage(); }
  function section(label, room = 28) {
    ensure(30 + room);
    draw(label.toUpperCase(), margin, y, 11, titleFont, red);
    line(y - 16, red, .8); y -= 25;
  }
  function paragraph(value, {size = 9, font = regular, color = ink, indent = 0} = {}) {
    for (const row of wrap(recorded(value), width - indent, size, font)) {
      ensure(size + 5); draw(row, margin + indent, y, size, font, color); y -= size + 4;
    }
    y -= 4;
  }
  function labeled(label, value) {
    ensure(38); paragraph(label, {size: 8, font: bold, color: muted}); paragraph(value);
  }

  // Rows may continue across pages. Every continuation repeats its section and
  // column labels; exceptionally long notes are wrapped rather than truncated.
  function table(title, headers, widths, rows, {size = 8.5, grid = false, intro = ''} = {}) {
    const padding = 6, leading = size + 2, verticalPadding = grid ? 4 : 6;
    const headerLines = headers.map((h, i) => wrap(h.toUpperCase(), widths[i] - 9, 6.5, bold));
    const headerHeight = headers.length ? Math.max(...headerLines.map(h => h.length)) * 9 + 8 : 0;
    const introHeight = intro ? wrap(intro, width, 8).length * 12 + 4 : 0;
    function start(continued = false) {
      section(title + (continued ? ' (continued)' : ''), introHeight + headerHeight + leading + verticalPadding);
      if (intro) paragraph(intro, {size: 8, color: muted});
      if (headerHeight) {
        page.drawRectangle({x: margin, y: y - headerHeight, width, height: headerHeight, color: tint});
        let x = margin;
        headerLines.forEach((lines, i) => { lines.forEach((v, j) => draw(v, x + padding, y - 4 - j * 9, 6.5, bold, muted)); x += widths[i]; });
        y -= headerHeight; line(y);
      }
    }
    start();
    rows.forEach((row, index) => {
      const cells = row.map((value, i) => wrap(value, widths[i] - padding * 2, size));
      let offset = 0, count = Math.max(1, ...cells.map(c => c.length));
      const freshSpace = 673 - bottom - 25 - headerHeight - introHeight;
      if (count * leading + verticalPadding <= freshSpace && y - count * leading - verticalPadding < bottom) { addPage(); start(true); }
      while (offset < count) {
        let fit = Math.floor((y - bottom - verticalPadding) / leading);
        if (fit < 1) { addPage(); start(true); fit = Math.floor((y - bottom - verticalPadding) / leading); }
        const take = Math.min(fit, count - offset), height = take * leading + verticalPadding;
        if (index % 2) page.drawRectangle({x: margin, y: y - height, width, height, color: rgb(.986, .986, .986)});
        let x = margin;
        cells.forEach((lines, i) => {
          const visible = offset && i === 0 && offset >= lines.length
            ? wrap(`${row[0]} (continued)`, widths[0] - padding * 2, size).slice(0, take)
            : lines.slice(offset, offset + take);
          visible.forEach((v, j) => draw(v, x + padding, y - verticalPadding / 2 - j * leading, size, regular, ink));
          x += widths[i];
          if (grid && i === 5) page.drawLine({start: {x, y}, end: {x, y: y - height}, color: rule, thickness: .8});
        });
        y -= height; line(y); offset += take;
        if (offset < count) { addPage(); start(true); }
      }
    });
    y -= 10;
  }
  function fields(entries, columns = 3) {
    const cellWidth = width / columns;
    for (let offset = 0; offset < entries.length; offset += columns) {
      const row = entries.slice(offset, offset + columns);
      const cells = row.map(([label, value]) => [
        ...wrap(label.toUpperCase(), cellWidth - 12, 7, bold).map(text => ({text, size: 7, font: bold, color: muted})),
        ...wrap(recorded(value), cellWidth - 12, 9).map(text => ({text, size: 9, font: regular, color: ink})),
      ]);
      const length = Math.max(...cells.map(c => c.length));
      if (length * 13 + 9 < 673 - bottom) ensure(length * 13 + 9);
      for (let i = 0; i < length; i++) {
        ensure(13);
        cells.forEach((cell, c) => { const item = cell[i]; if (item) draw(item.text, margin + c * cellWidth, y, item.size, item.font, item.color); });
        y -= 13;
      }
      y -= 5;
    }
  }
  const priority = findings => {
    const open = findings.filter(f => !f.completed), result = highestPriority({findings});
    return `${result === 'None recorded' && open.length ? 'Unassigned' : result}${open.some(f => !f.priority) && result !== 'None recorded' ? ' / unassigned' : ''}`;
  };
  function findings(items) {
    if (!items.length) { section('Findings and recommendations'); paragraph('No findings recorded.'); return; }
    const lines = f => [
      `Observation: ${recorded(f.description)}`,
      `Recommended action: ${recorded(f.recommendation)}`,
      ...(f.codeReference ? [`Code reference: ${f.codeReference}`] : []),
      ...(f.legacySeverity ? [`Legacy severity (as recorded): ${f.legacySeverity}`] : []),
      ...(f.correctionEvidence ? [`Correction evidence: ${f.correctionEvidence}`] : []),
    ];
    const height = f => 23 + lines(f).reduce((n, value) => n + wrap(value).length * 13 + 4, 0);
    for (const category of ['code', 'safety', 'repair', '']) {
      const grouped = items.filter(f => f.category === category);
      if (!grouped.length) continue;
      section(FINDING_CATEGORIES[category] || 'Findings awaiting classification', height(grouped[0]) <= 673 - bottom - 30 ? height(grouped[0]) : 120);
      for (const f of grouped) {
        if (height(f) <= 673 - bottom - 30) {
          if (y - height(f) < bottom) { addPage(); section(FINDING_CATEGORIES[category] || 'Findings awaiting classification', height(f)); }
        } else ensure(72);
        const number = document.findings.findIndex(item => item.id === f.id) + 1;
        paragraph(`Finding ${number}  |  ${f.priority || 'Priority unassigned'}  |  ${f.completed ? 'Correction completed' : 'Open'}`, {font: bold, color: red});
        lines(f).forEach(value => paragraph(value));
        y -= 6;
      }
    }
  }
  async function evidence(items) {
    if (!items.length) return;
    for (const photo of items) {
      const image = photo.mime_type === 'image/png' ? await pdf.embedPng(photo.bytes) : await pdf.embedJpg(photo.bytes);
      const scale = Math.min(width / image.width, 260 / image.height, 1);
      const heading = `${photo.finding_id ? `Finding ${document.findings.findIndex(f => f.id === photo.finding_id) + 1} | ` : ''}${photo.file_name}`;
      const headingHeight = wrap(heading, width, 9, bold).length * 13 + 4;
      ensure(Math.min(headingHeight + image.height * scale + 80, 673 - bottom));
      section('Photo evidence');
      paragraph(heading, {font: bold}); ensure(image.height * scale + 24);
      page.drawImage(image, {x: margin, y: y - image.height * scale, width: image.width * scale, height: image.height * scale});
      y -= image.height * scale + 12;
      paragraph(photo.caption || 'No caption recorded.');
      paragraph(`Evidence ID: ${photo.id}`, {size: 7, color: muted}); y -= 10;
    }
  }
  function circuits(equipment) {
    addPage(equipment);
    const notes = [];
    function note(circuit, value) {
      let item = notes.find(n => n.text === value);
      if (!item) { item = {text: value, circuits: [], number: notes.length + 1}; notes.push(item); }
      item.circuits.push(circuit.number); return item.number;
    }
    const cell = c => {
      if (!c) return ['', '', '', '', '', ''];
      const r = c.temperature, details = [];
      let description = compactMissing(c.description);
      if (String(c.description || '').length > 72) { details.push(c.description); description = ''; }
      if (r.reason) details.push(`Temperature: ${r.reason}`);
      if (r.conductor) details.push(`Temperature conductor: ${r.conductor}`);
      if (r.label && r.label !== `Circuit ${c.number}`) details.push(`Reading label: ${r.label}`);
      if (details.length) description = `${description === '—' ? '' : description}${description && description !== '—' ? '\n' : ''}See note ${note(c, details.join('\n'))}`;
      const temperature = r.state === 'measured' ? measured(r) : ({not_recorded: 'N/R', not_measured: 'N/M', not_applicable: 'N/A', inaccessible: 'Inacc.'}[r.state] || recorded(r.state));
      return [String(c.number), temperature, withAmps(c.breakerAmps), compactMissing(c.wireSize), compactMissing(c.poles), description];
    };
    const rows = [], sorted = [...equipment.circuits].sort((a, b) => a.number - b.number);
    const positions = new Map(sorted.map(c => [c.number, c]));
    for (let n = 1; n <= Math.max(equipment.circuitCount, ...sorted.map(c => c.number)); n += 2) rows.push([...cell(positions.get(n)), ...cell(positions.get(n + 1))]);
    const intro = 'Odd circuits left; even circuits right. P = poles; dash = no value recorded.\nN/R = not recorded; N/M = not measured; N/A = not applicable; Inacc. = inaccessible.';
    table(`Branch-circuit data - ${equipment.circuitCount} positions`, ['Ckt', 'Temp', 'Amps', 'Wire', 'P', 'Load / notes', 'Ckt', 'Temp', 'Amps', 'Wire', 'P', 'Load / notes'], [24, 44, 38, 30, 26, 104, 24, 44, 38, 30, 26, 104], rows, {size: 8, grid: true, intro});
    if (notes.length) {
      section('Circuit notes');
      for (const n of notes) labeled(`Note ${n.number} - Circuit${n.circuits.length > 1 ? 's' : ''} ${n.circuits.join(', ')}`, n.text);
    }
  }

  addPage(null);
  section('Client and visit information');
  fields([['Client', document.client.clientName], ['Site address', document.client.siteAddress], ['Contact', document.client.contactName],
    ['Phone', document.client.contactPhone], ['Email', document.client.contactEmail], ['Historical job reference', document.client.jobNumber],
    ['Visit date', date(document.visitDate)], ['Visit time', document.visitTime], ['Time zone', document.timeZone]]);
  if (revision) fields([['Assigned technician', revision.technician_name], ['Reviewed by', revision.reviewer_name], ['Issued at', revision.issued_at]]);
  if (revision?.job_snapshot) labeled('Linked job at issue', `${revision.job_snapshot.number} - ${revision.job_snapshot.name}`);
  if (document.technicianLegacy) labeled('Legacy technician reference', document.technicianLegacy);
  table('Equipment summary', ['Equipment', 'Voltage', 'Rating', 'Recorded observations', 'Open findings', 'Highest open priority'], [76, 64, 60, 130, 62, 140], document.equipment.map(e => {
    const p = equipmentProgress(e), rows = document.findings.filter(f => f.equipmentId === e.id);
    return [e.designator || 'Unnamed', compactMissing(e.nominalVoltage), withAmps(e.amperage), `${p.completed} of ${p.total} (${p.percent}%)`, String(rows.filter(f => !f.completed).length), priority(rows)];
  }));
  const progress = inspectionProgress(document);
  paragraph(`Recorded observations: ${progress.completed} of ${progress.total}; ${progress.unassessed} unassessed. Completion describes recorded information, not an equipment condition grade.`, {size: 8, color: muted});
  section('Review summary');
  fields([['Highest open priority', priority(document.findings)], ['Assessment', document.assessment]], 2);
  paragraph(document.reviewSummary);
  if (!revision && document.importWarnings?.some(w => !w.resolution?.trim())) paragraph('Unresolved import notes remain. This draft requires review before issue.', {font: bold, color: red});
  section('Scope and conditions');
  paragraph(document.scope);
  if (document.optionalScope) labeled('Optional scope', document.optionalScope);
  fields([['Limitations', document.limitations], ['Conditions', document.conditions]], 2);
  if (document.client.visitNotes) labeled('Visit notes', document.client.visitNotes);
  const general = document.findings.filter(f => !document.equipment.some(e => e.id === f.equipmentId));
  if (general.length) findings(general);
  await evidence(photos.filter(p => !document.equipment.some(e => e.id === p.equipment_id)));

  for (const e of document.equipment) {
    addPage(e);
    section('Equipment information');
    fields([['Designator', e.designator], ['Nominal voltage', e.nominalVoltage], ['Equipment rating', withAmps(e.amperage)],
      ['Main configuration', e.mainConfig], ['Phase configuration', e.phaseConfig], ['Phase rotation', e.phaseRotation],
      ['Equipment type', e.equipmentType], ['Visit date', date(e.visitDate)], ['Visit time', e.visitTime]]);
    if (e.faultCurrent || e.faultCurrentDate) fields([['Fault current (as recorded)', e.faultCurrent], ['Fault current date', e.faultCurrentDate]], 2);
    const progress = equipmentProgress(e), items = document.findings.filter(f => f.equipmentId === e.id);
    paragraph(`${progress.completed} of ${progress.total} observations recorded (${progress.percent}%)  |  ${items.filter(f => !f.completed).length} open findings`, {font: bold});
    for (const [label, rows] of [['Visual inspection', e.visual], ['Labeling and identification', e.labeling]]) {
      table(label, ['Inspection item', 'Status', 'Notes'], [267, 95, 170], rows.map(r => [r.label, RESPONSE_STATES[r.state] || r.state, compactMissing(r.notes)]));
    }
    if (e.feeders.length) {
      const readingText = (r, kind) => {
        const standard = kind === 'temperature' ? 'Termination' : kind === 'current' ? 'Feeder current' : 'Voltage';
        const label = r.label && r.label !== standard ? r.label : '';
        const channel = r.conductor || (kind === 'voltage' ? 'Pair not recorded' : 'Channel not recorded');
        return `${[label, channel].filter(Boolean).join(' / ')}: ${measured(r)}${r.reason ? '\n' + r.reason : ''}`;
      };
      table('Feeder readings', ['Feeder / configuration', 'Termination temperature', 'Current', 'Voltage'], [116, 132, 126, 158], e.feeders.map((f, i) => [
        `Feeder ${i + 1}\nSets: ${recorded(f.sets)}\nSize: ${recorded(f.size)}\n${recorded(f.material)}\n${recorded(f.insulation)}`,
        ...['temperature', 'current', 'voltage'].map(kind => f.readings.filter(r => r.kind === kind).map(r => readingText(r, kind)).join('\n') || 'Not recorded'),
      ]), {size: 8});
    } else { section('Feeder readings'); paragraph('No feeder records.'); }
    if (e.readings.length) table('Additional readings', ['Observation', 'Conductor / pair', 'Value / state', 'Notes'], [162, 114, 96, 160], e.readings.map(r => [r.label || r.kind, recorded(r.conductor), measured(r), compactMissing(r.reason)]));
    const notes = [['Equipment notes', e.notes], ['Visual / thermal notes', e.thermalNotes], ['Voltage notes', e.voltageNotes], ['Reason for unassessed observations', e.unassessedReason]].filter(([, value]) => hasValue(value));
    const noteLines = notes.map(([label, value]) => `${label}: ${value}`);
    const notesHeight = 30 + noteLines.reduce((n, value) => n + wrap(value).length * 13 + 4, 0);
    const notesFit = notes.length && y - notesHeight >= bottom;
    const printNotes = () => { section('Inspector notes'); noteLines.forEach(value => paragraph(value)); };
    if (notesFit) printNotes();
    circuits(e); findings(items);
    if (notes.length && !notesFit) printNotes();
    await evidence(photos.filter(p => p.equipment_id === e.id));
  }
  pages.forEach((p, i) => {
    page = p; line(bottom - 12, red, .8);
    footerLines.forEach((v, n) => draw(v, margin, bottom - 20 - n * 9, 7, regular, muted));
    const count = `Page ${i + 1} of ${pages.length}`;
    draw(count, margin + width - advance(count, 7), bottom - 20, 7, regular, muted);
    const contact = '1403 Capital Blvd, Raleigh, NC 27603  |  919-810-6871  |  thenorthgategroup.com';
    draw(contact, margin, 22, 7, regular, red);
  });
  return pdf.save();
}
