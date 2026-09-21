const OPTIONS = Object.freeze([
  ['budget', 'Budget'],
  ['costs', 'Costs to date'],
  ['changeOrders', 'Change orders'],
  ['monthlyForecast', 'Monthly forecast'],
  ['completionForecast', 'Completion forecast'],
  ['notes', 'Notes'],
]);

export const FINANCIAL_EXPORT_OPTIONS = OPTIONS;

const amount = (value) => Number(value) || 0;
const divisionCodeFromLine = (line) => line?.project_division?.code
  || String(line?.cost_code || '').match(/^\d{2}/)?.[0]
  || '';
const divisionNameFromLine = (line) => line?.project_division?.name || '';
const divisionKeyFromLine = (line) => line?.project_division_id
  || line?.project_division?.id
  || (divisionCodeFromLine(line) ? `cost:${divisionCodeFromLine(line)}` : 'unassigned');
const divisionLabelFromLine = (line) => {
  const code = divisionCodeFromLine(line);
  const name = divisionNameFromLine(line);
  if (code && name) return `${code} — ${name}`;
  if (code) return `Division ${code}`;
  return 'Unassigned project division';
};
const csvCell = (value, protectFormula = true) => {
  const raw = String(value ?? '');
  const text = protectFormula && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function financialExportColumns(selected) {
  return [
    { key: 'costCode', label: 'Cost Code' },
    { key: 'description', label: 'Description' },
    ...(selected.budget ? [{ key: 'budget', label: 'Budget' }] : []),
    ...(selected.costs ? [{ key: 'costs', label: 'Costs to Date' }] : []),
    ...(selected.changeOrders ? [{ key: 'changeOrders', label: 'Change Orders' }] : []),
    ...(selected.monthlyForecast ? [{ key: 'monthlyForecast', label: 'Monthly Forecast' }] : []),
    ...(selected.completionForecast ? [{ key: 'completionForecast', label: 'Completion Forecast' }] : []),
    ...(selected.notes ? [{ key: 'notes', label: 'Notes' }] : []),
  ];
}

export function buildFinancialExportRows(lines, changeOrderByLineId = new Map()) {
  return lines.map((line) => ({
    projectDivisionKey: divisionKeyFromLine(line),
    projectDivisionCode: divisionCodeFromLine(line),
    projectDivisionName: divisionNameFromLine(line),
    projectDivisionLabel: divisionLabelFromLine(line),
    projectDivisionSortOrder: line?.project_division?.sort_order ?? Number(divisionCodeFromLine(line) || 999),
    costCode: line.cost_code || '',
    description: line.description || '',
    budget: amount(line.current_budget_override_amount ?? (amount(line.budget_amount) + amount(line.budget_change_amount) + amount(changeOrderByLineId.get(line.id)))),
    costs: amount(line.actual_cost_amount),
    changeOrders: amount(changeOrderByLineId.get(line.id)),
    monthlyForecast: amount(line.forecast_to_complete_amount),
    completionForecast: amount(line.forecast_final_amount),
    notes: line.note || '',
  }));
}

export function financialExportDivisions(rows) {
  return [...rows.reduce((divisions, row) => {
    if (!divisions.has(row.projectDivisionKey)) divisions.set(row.projectDivisionKey, {
      key: row.projectDivisionKey,
      code: row.projectDivisionCode,
      name: row.projectDivisionName,
      label: row.projectDivisionLabel,
      sortOrder: row.projectDivisionSortOrder,
      lineCount: 0,
    });
    divisions.get(row.projectDivisionKey).lineCount += 1;
    return divisions;
  }, new Map()).values()].sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label));
}

export function filterFinancialExportRows(rows, selectedDivisionKeys) {
  const selected = selectedDivisionKeys instanceof Set ? selectedDivisionKeys : new Set(selectedDivisionKeys || []);
  return rows.filter((row) => selected.has(row.projectDivisionKey));
}

export function financialExportCsv(rows, selected) {
  const columns = financialExportColumns(selected);
  const moneyKeys = new Set(['budget','costs','changeOrders','monthlyForecast','completionForecast']);
  return [
    columns.map((column) => csvCell(column.label)).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(moneyKeys.has(column.key) ? amount(row[column.key]).toFixed(2) : row[column.key], !moneyKeys.has(column.key))).join(',')),
    columns.map((column, index) => index === 0 ? 'TOTAL' : index === 1 ? '' : moneyKeys.has(column.key) ? rows.reduce((sum,row) => sum + amount(row[column.key]),0).toFixed(2) : '').map((value) => csvCell(value)).join(','),
  ].join('\r\n');
}

export async function financialExportPdf({ job, rows, selected }) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const columns = financialExportColumns(selected);
  const moneyKeys = new Set(['budget','costs','changeOrders','monthlyForecast','completionForecast']);
  const pageSize = [792,612];
  const margin = 30;
  const usable = pageSize[0] - margin * 2;
  const descriptionWidth = selected.notes ? 145 : 190;
  const notesWidth = selected.notes ? 135 : 0;
  const fixed = 76 + descriptionWidth + notesWidth;
  const numericCount = columns.filter((column) => moneyKeys.has(column.key)).length;
  const numericWidth = numericCount ? Math.max(70,(usable-fixed)/numericCount) : 0;
  const widths = columns.map((column) => column.key === 'costCode' ? 76 : column.key === 'description' ? descriptionWidth : column.key === 'notes' ? notesWidth : numericWidth);
  const currency = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
  let page, y;
  const text = (value,x,top,size=7,font=normal,color=rgb(0.08,0.1,0.12)) => page.drawText(String(value ?? ''),{x,y:top,size,font,color});
  const truncate=(value,width,size=7)=>{const raw=String(value??'');let out=raw;while(out.length&&normal.widthOfTextAtSize(out,size)>width-6)out=out.slice(0,-1);return out===raw?raw:`${out.slice(0,-1)}…`;};
  const header=()=>{
    page=pdf.addPage(pageSize);y=pageSize[1]-margin;
    text('NORTHGATE HQ',margin,y,9,bold,rgb(.74,.08,.1));y-=16;
    text(`Job Financial Report · ${job.job_number || ''} ${job.name || ''}`.trim(),margin,y,14,bold);y-=14;
    text(`Generated ${new Date().toLocaleString()}`,margin,y,7,normal,rgb(.35,.39,.43));y-=18;
    page.drawRectangle({x:margin,y:y-14,width:usable,height:18,color:rgb(.94,.95,.96)});
    let x=margin;columns.forEach((column,index)=>{text(column.label,x+3,y-9,6.5,bold);x+=widths[index];});y-=20;
  };
  header();
  for(const row of rows){
    if(y<55) header();
    let x=margin;
    columns.forEach((column,index)=>{
      const value=moneyKeys.has(column.key)?currency.format(amount(row[column.key])):truncate(row[column.key],widths[index]);
      text(value,x+3,y-9,6.5,column.key==='costCode'?bold:normal);x+=widths[index];
    });
    page.drawLine({start:{x:margin,y:y-13},end:{x:margin+usable,y:y-13},thickness:.35,color:rgb(.82,.84,.86)});y-=17;
  }
  if(y<60) header();
  let x=margin;
  columns.forEach((column,index)=>{
    const value=column.key==='costCode'?'TOTAL':moneyKeys.has(column.key)?currency.format(rows.reduce((sum,row)=>sum+amount(row[column.key]),0)):'';
    text(value,x+3,y-9,7,bold);x+=widths[index];
  });
  return pdf.save();
}

export function downloadFinancialFile(content, filename, type) {
  const blob = new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();
  URL.revokeObjectURL(url);
}
