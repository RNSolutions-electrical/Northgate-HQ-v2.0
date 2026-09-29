import { inventoryExportRows } from './inventoryExports.js';

const PAGE_WIDTH = 792;
const PAGE_HEIGHT = 612;
const MARGIN = 30;
const TABLE_TOP = 486;
const TABLE_BOTTOM = 49;
const HEADER_HEIGHT = 26;
const COLUMNS = [
  { key: 'code', label: 'CODE', left: 30, right: 147 },
  { key: 'item', label: 'MATERIAL', left: 147, right: 377 },
  { key: 'location', label: 'LOCATION', left: 377, right: 520 },
  { key: 'unit', label: 'UNIT', left: 520, right: 563 },
  { key: 'countedQuantity', label: 'COUNTED QTY', left: 563, right: 652 },
  { key: 'notes', label: 'NOTES', left: 652, right: 762 },
];

function printable(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u00bc/g, '1/4').replace(/\u00bd/g, '1/2').replace(/\u00be/g, '3/4')
    .replace(/\u00b0/g, ' deg')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '?');
}

function wrapText(value, font, size, maxWidth) {
  const words = printable(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const char of word) {
      if (line && font.widthOfTextAtSize(line + char, size) > maxWidth) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function drawLine(page, x1, y, x2, color, width = 0.6) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: width, color });
}

/** A print-ready, location-scoped count sheet. It deliberately excludes system quantities and prices. */
export async function buildBlankInventoryCountPdf(rows, { location = 'All storage locations', search = '', generatedAt = new Date() } = {}) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.16, 0.22);
  const muted = rgb(0.36, 0.40, 0.46);
  const rule = rgb(0.73, 0.76, 0.80);
  const pale = rgb(0.94, 0.95, 0.96);
  const red = rgb(0.69, 0.13, 0.17);
  const data = inventoryExportRows('blank', [], rows).sort((a, b) =>
    String(a.location).localeCompare(String(b.location), undefined, { numeric: true })
    || String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
  const pages = [];

  function addPage() {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    page.drawText('NORTHGATE HQ', { x: MARGIN, y: 573, size: 12, font: bold, color: red });
    page.drawText('INVENTORY COUNT SHEET', { x: MARGIN, y: 550, size: 17, font: bold, color: ink });
    page.drawText('Location:', { x: MARGIN, y: 524, size: 9, font: bold, color: ink });
    const locationLines = wrapText(location, regular, 9, 452);
    page.drawText(locationLines[0], { x: 76, y: 524, size: 9, font: regular, color: ink });
    if (locationLines.length > 1) page.drawText(locationLines.slice(1).join(' ').slice(0, 85), { x: 76, y: 512, size: 8, font: regular, color: ink });
    page.drawText('Counted by: _________________________', { x: 560, y: 550, size: 9, font: regular, color: ink });
    page.drawText('Count date: __________________________', { x: 560, y: 529, size: 9, font: regular, color: ink });
    page.drawText('Record actual quantities. A blank count is not zero. Enter results in Inventory Management after counting.',
      { x: MARGIN, y: 501, size: 8, font: regular, color: muted });
    if (search) page.drawText(`Search filter: ${printable(search).slice(0, 95)}`, { x: MARGIN, y: 512, size: 8, font: regular, color: muted });
    page.drawRectangle({ x: MARGIN, y: TABLE_TOP - HEADER_HEIGHT, width: PAGE_WIDTH - 2 * MARGIN, height: HEADER_HEIGHT, color: pale });
    for (const column of COLUMNS) page.drawText(column.label, { x: column.left + 6, y: TABLE_TOP - 17, size: 7.4, font: bold, color: ink });
    drawLine(page, MARGIN, TABLE_TOP - HEADER_HEIGHT, PAGE_WIDTH - MARGIN, rule);
    return { page, y: TABLE_TOP - HEADER_HEIGHT };
  }

  let current = addPage();
  for (const row of data) {
    const cellLines = COLUMNS.map(column => column.key === 'countedQuantity' || column.key === 'notes'
      ? [''] : wrapText(row[column.key], regular, 8.2, column.right - column.left - 12));
    const height = Math.max(31, Math.max(...cellLines.map(lines => lines.length)) * 10.3 + 12);
    if (current.y - height < TABLE_BOTTOM) current = addPage();
    const top = current.y;
    const bottom = top - height;
    for (let columnIndex = 0; columnIndex < COLUMNS.length; columnIndex += 1) {
      const column = COLUMNS[columnIndex];
      cellLines[columnIndex].forEach((line, lineIndex) => {
        if (line) current.page.drawText(line, { x: column.left + 6, y: top - 13 - lineIndex * 10.3, size: 8.2, font: regular, color: ink });
      });
      if (columnIndex > 0) current.page.drawLine({ start: { x: column.left, y: top }, end: { x: column.left, y: bottom }, thickness: 0.4, color: rule });
    }
    drawLine(current.page, MARGIN, bottom, PAGE_WIDTH - MARGIN, rule);
    current.y = bottom;
  }

  const dateLabel = generatedAt instanceof Date && !Number.isNaN(generatedAt.getTime())
    ? generatedAt.toISOString().slice(0, 10) : '';
  pages.forEach((page, index) => {
    page.drawText(`${data.length} listed material${data.length === 1 ? '' : 's'}  |  Generated ${dateLabel}`,
      { x: MARGIN, y: 25, size: 8, font: regular, color: muted });
    page.drawText(`Page ${index + 1} of ${pages.length}`, { x: PAGE_WIDTH - 91, y: 25, size: 8, font: regular, color: muted });
  });
  return pdf.save();
}
