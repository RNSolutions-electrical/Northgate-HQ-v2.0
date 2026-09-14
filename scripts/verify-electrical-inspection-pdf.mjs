import {mkdir, writeFile, readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {getDocument, OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {blankInspection, blankEquipment, blankReading, blankFinding, blankFeeder} from '../src/modules/electrical-inspections/inspectionModel.js';
import {inspectionPdf} from '../src/modules/electrical-inspections/inspectionPdf.js';

const document = blankInspection();
document.client = {clientName: 'Example Facility - SAMPLE REPORT', siteAddress: '100 Example Way', contactName: 'Test Contact', contactPhone: '', contactEmail: '', jobNumber: 'TEST-001', visitNotes: 'Synthetic data for report layout review; this is not a field inspection.'};
document.visitDate = '2026-09-14'; document.visitTime = '09:15';
document.assessment = 'Follow-up needed';
document.reviewSummary = 'Observed conditions require follow-up. Review the findings for each panel and the circuit notes that accompany its schedule. No engineering thresholds are inferred from the logged readings.';
document.limitations = 'Recorded observations cover accessible equipment only.';
document.conditions = 'Synthetic example; no site conditions verified.';
for (let i = 1; i <= 3; i++) {
  const e = blankEquipment();
  Object.assign(e, {designator: `P-${i}`, nominalVoltage: '120/208', amperage: '225', mainConfig: 'Main lug', phaseConfig: '3 phase / 5 wire', phaseRotation: 'Clockwise', visitDate: document.visitDate, visitTime: '09:15', unassessedReason: 'Access was limited; unmeasured positions remain explicit.', notes: 'Equipment notes with punctuation and accents: café — intact.'});
  [...e.visual, ...e.labeling].forEach((r, index) => { r.state = index === 3 || index === 6 ? 'attention' : index === 9 ? 'not_assessed' : 'acceptable'; });
  e.visual[3].notes = 'Opening requires follow-up.';
  e.circuits.forEach((c, n) => { Object.assign(c, {breakerAmps: '20', wireSize: '12', poles: '1', description: n % 3 === 0 ? `Lighting zone ${n + 1}` : `Receptacle zone ${n + 1}`}); if (n < 41) Object.assign(c.temperature, {value: String(78 + (n % 10) / 10), state: 'measured'}); });
  e.circuits[0].temperature.value = '0';
  e.circuits[4].description = e.circuits[6].description = 'Verify the equipment requirements before making a repair recommendation. This longer circuit note is retained below the schedule so the table remains readable.';
  e.circuits[41].description = 'Circuit 42 - final position';
  const feeder = blankFeeder(); Object.assign(feeder, {sets: '1', size: '250', material: 'Copper', insulation: 'THHN'});
  feeder.readings.forEach((r, n) => { r.state = 'measured'; r.value = r.kind === 'temperature' ? '82.4' : r.kind === 'current' ? '11.19' : '120.5'; if (r.kind === 'voltage') { r.conductor = ['A-N', 'B-N', 'C-N', 'N-G'][Math.floor(n / 3)]; if (r.conductor === 'N-G') r.value = '0'; } });
  e.feeders = [feeder];
  if (i === 3) { e.circuits[1].temperature = {...e.circuits[1].temperature, value: '25', unit: 'C'}; Object.assign(e.circuits[3].temperature, {value: '', state: 'inaccessible', reason: 'Cover could not be safely accessed.'}); }
  document.equipment.push(e);
  document.findings.push({...blankFinding(e.id), category: i === 1 ? 'safety' : i === 2 ? 'code' : 'repair', priority: i === 1 ? 'High' : 'Low', description: `Example observation ${i}: recorded condition requires follow-up.`, recommendation: 'Confirm the recorded condition and arrange the appropriate repair. Document the correction before closing this finding.', codeReference: i === 2 ? 'Reference recorded by reviewer' : '', legacySeverity: i === 1 ? 'major' : '', completed: false});
}
const revision = {revision: 1, issued_at: '2026-09-14T23:00:00Z', reviewer_name: 'Test Reviewer', technician_name: 'Test Technician', job_snapshot: {number: 'TEST-001', name: 'Example Job'}};
const logoBytes = await readFile('src/modules/electrical-inspections/inspection-report-logo.png');
const photos = [{id: 'synthetic-photo', mime_type: 'image/jpeg', bytes: await readFile('public/northgate-group-logo.jpg'), equipment_id: document.equipment[0].id, finding_id: document.findings[0].id, file_name: 'example-brand-asset.jpg', caption: 'Illustrative test image; no field evidence.'}];

async function inspect(bytes) {
  const pdf = await getDocument({data: bytes.slice(), useSystemFonts: true}).promise;
  let text = '', images = 0; const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i), content = await page.getTextContent();
    pages.push(content.items); text += content.items.map(x => x.str).join(' ') + '\n';
    for (const item of content.items.filter(x => x.str.trim())) {
      assert.ok(item.transform[4] >= 39.9 && item.transform[4] + item.width <= 572.1, `Horizontal overflow on page ${i}: ${item.str} [${item.transform[4]}, ${item.transform[4] + item.width}]`);
      assert.ok(item.transform[5] >= 14 && item.transform[5] <= 757, `Vertical overflow on page ${i}: ${item.str}`);
    }
    const painted = content.items.filter(x => x.str.trim());
    for (let a = 0; a < painted.length; a++) for (let b = a + 1; b < painted.length; b++) {
      const left = painted[a], right = painted[b];
      if (Math.abs(left.transform[5] - right.transform[5]) < 1) assert.ok(left.transform[4] + left.width <= right.transform[4] + .1 || right.transform[4] + right.width <= left.transform[4] + .1, `Overlapping text on page ${i}: ${left.str} / ${right.str}`);
    }
    const operations = await page.getOperatorList(); images += operations.fnArray.filter(op => op === OPS.paintImageXObject).length;
    assert.ok(painted.some(x => x.str === `Page ${i} of ${pdf.numPages}`), 'Every page needs an accurate footer');
  }
  const result = {text, pages, images, numPages: pdf.numPages}; await pdf.destroy(); return result;
}
const args = {inspectionNumber: 'HI-TEST-001', document, revision, photos, logoBytes};
const original = JSON.stringify(document), bytes = await inspectionPdf(args);
assert.deepEqual(await inspectionPdf(args), bytes, 'Issued rendering must be deterministic for upload retry.');
assert.equal(JSON.stringify(document), original, 'Rendering must not change saved data.');
const sample = await inspect(bytes);
for (const required of ['P-1', 'P-2', 'P-3', '0 °F', '25 °C', '120.5 V', '0 V', 'Not recorded', 'Circuit 42', 'High', 'Test Reviewer', 'Example Job', 'Illustrative test image', 'Legacy severity', 'N/R', 'Inacc.', 'Cover could not be safely accessed.', 'CIRCUIT NOTES', '5, 7']) assert.ok(sample.text.includes(required), required + ' must appear in PDF');
for (const finding of document.findings) { assert.ok(sample.text.includes(finding.description)); assert.ok(sample.text.replace(/\s+/g, ' ').includes(finding.recommendation)); }
assert.ok(sample.images >= sample.numPages + 1, 'Branding on each page plus photo evidence');
// Odd/even positions share a row and the final configured circuit is retained.
let schedules = 0;
for (const items of sample.pages) if (items.some(x => x.str === 'BRANCH-CIRCUIT DATA - 42 POSITIONS')) {
  schedules++;
  const first = items.find(x => x.str === '1' && Math.abs(x.transform[4] - 46) < .1);
  const second = items.find(x => x.str === '2' && Math.abs(x.transform[4] - 312) < .1);
  assert.ok(first && second && first.transform[5] === second.transform[5], 'Circuit 1 and 2 must be paired');
}
assert.equal(schedules, 3);
// Exercise pagination risks separately from the clean review sample.
const stress = structuredClone(document); stress.equipment = stress.equipment.slice(0, 1); stress.findings = stress.findings.slice(0, 1);
stress.client.siteAddress = 'VeryLongUnbrokenAddress'.repeat(12) + ' ADDRESS-END';
stress.equipment[0].visual[0].notes = 'Long checklist note for continued rows. '.repeat(180) + 'CHECKLIST-END';
stress.equipment[0].circuits[0].description = 'Long circuit explanation. '.repeat(140) + 'CIRCUIT-NOTE-END';
stress.equipment[0].readings = [{...blankReading('voltage', 'Unresolved legacy channel', '', 'V'), value: '0', state: 'measured', reason: 'Original context preserved.'}];
stress.equipment[0].feeders[0].readings.filter(r => r.kind === 'voltage').forEach(r => { r.conductor = ''; });
stress.findings[0].recommendation = 'Long recommendation retains every word. '.repeat(110) + 'RECOMMENDATION-END';
stress.importWarnings = [{resolution: ''}];
const stressBytes = await inspectionPdf({inspectionNumber: 'HI-STRESS-001', document: stress, logoBytes});
const stressReport = await inspect(stressBytes);
for (const required of ['ADDRESS-END', 'CHECKLIST-END', 'CIRCUIT-NOTE-END', 'RECOMMENDATION-END', 'DRAFT - NOT ISSUED', 'Unresolved import notes', 'Pair not recorded', '(CONTINUED)']) assert.ok(stressReport.text.includes(required), required + ' must survive pagination');
await mkdir('.temp/inspection-qa', {recursive: true});
await writeFile('.temp/inspection-qa/inspection-report-sample.pdf', bytes);
await writeFile('.temp/inspection-qa/inspection-report-text.txt', sample.text);
await writeFile('.temp/inspection-qa/inspection-report-stress.pdf', stressBytes);
console.log(`PASS: ${sample.numPages}-page branded sample and ${stressReport.numPages}-page stress report; deterministic bytes, unchanged source, paired circuits, long-row pagination, text bounds/non-overlap, units/zero/missing values, findings, photos, draft/issue metadata.`);
