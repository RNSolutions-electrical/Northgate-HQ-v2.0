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
    manualBudgetChange: amount(line.budget_change_amount),
    hasCurrentBudgetOverride: line.current_budget_override_amount !== null && line.current_budget_override_amount !== undefined,
    costs: amount(line.actual_cost_amount),
    committedCosts: amount(line.committed_cost_amount),
    changeOrders: amount(changeOrderByLineId.get(line.id)),
    monthlyForecast: amount(line.forecast_to_complete_amount),
    completionForecast: amount(line.forecast_final_amount),
    category: line.category || '',
    notes: line.note || '',
  }));
}

export function financialExportSummary(rows) {
  const currentBudget = rows.reduce((sum, row) => sum + amount(row.budget), 0);
  const completionForecast = rows.reduce((sum, row) => sum + amount(row.completionForecast), 0);
  const projectedGrossProfit = currentBudget - completionForecast;
  return {
    currentBudget,
    actualCosts: rows.reduce((sum, row) => sum + amount(row.costs), 0),
    committedCosts: rows.reduce((sum, row) => sum + amount(row.committedCosts), 0),
    completionForecast,
    forecastedRemainingBudget: projectedGrossProfit,
    estimatedProfit: rows.filter((row) => row.category === 'ohp_fee').reduce((sum, row) => sum + amount(row.budget), 0),
    projectedGrossProfit,
    projectedMargin: currentBudget ? projectedGrossProfit / currentBudget : null,
    changeTotal: rows.reduce((sum, row) => sum + amount(row.manualBudgetChange) + amount(row.changeOrders), 0),
    overrideCount: rows.filter((row) => row.hasCurrentBudgetOverride).length,
  };
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
  const descriptionWidth = selected.notes ? 135 : 190;
  const notesWidth = selected.notes ? 170 : 0;
  const fixed = 76 + descriptionWidth + notesWidth;
  const numericCount = columns.filter((column) => moneyKeys.has(column.key)).length;
  const numericWidth = numericCount ? Math.max(70,(usable-fixed)/numericCount) : 0;
  const widths = columns.map((column) => column.key === 'costCode' ? 76 : column.key === 'description' ? descriptionWidth : column.key === 'notes' ? notesWidth : numericWidth);
  const currency = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
  const percent = new Intl.NumberFormat('en-US',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1});
  const summary = financialExportSummary(rows);
  const divisionLabels = [...new Set(rows.map((row) => row.projectDivisionLabel).filter(Boolean))];
  const scopeLabel = divisionLabels.length === 1
    ? divisionLabels[0].replaceAll('—', '-')
    : `${divisionLabels.length} selected project divisions`;
  let page, y;
  const text = (value,x,top,size=7,font=normal,color=rgb(0.08,0.1,0.12)) => page.drawText(String(value ?? ''),{x,y:top,size,font,color});
  const wrap=(value,width,size=6.5,font=normal)=>{
    const max=Math.max(8,width-6);const lines=[];
    for(const paragraph of String(value??'').split(/\r?\n/)){
      const words=paragraph.split(/\s+/).filter(Boolean);let line='';
      if(!words.length){lines.push('');continue;}
      for(let word of words){
        while(font.widthOfTextAtSize(word,size)>max){let cut=word.length;while(cut>1&&font.widthOfTextAtSize(word.slice(0,cut),size)>max)cut-=1;const part=word.slice(0,cut);if(line){lines.push(line);line='';}lines.push(part);word=word.slice(cut);}
        const candidate=line?`${line} ${word}`:word;
        if(line&&font.widthOfTextAtSize(candidate,size)>max){lines.push(line);line=word;}else line=candidate;
      }
      if(line)lines.push(line);
    }
    return lines.length?lines:[''];
  };
  const drawSummary=()=>{
    const cards=[
      ['CURRENT BUDGET',currency.format(summary.currentBudget),`${currency.format(summary.changeTotal)} in changes; ${summary.overrideCount} manual override${summary.overrideCount===1?'':'s'}`],
      ['ACTUAL COSTS',currency.format(summary.actualCosts),'Costs posted to date'],
      ['COMMITTED COSTS',currency.format(summary.committedCosts),'Buyout or committed exposure'],
      ['COMPLETION FORECAST',currency.format(summary.completionForecast),'Expected total cost at completion'],
      ['FORECASTED REMAINING BUDGET',currency.format(summary.forecastedRemainingBudget),'Current budget minus completion forecast'],
      ['ESTIMATED PROFIT',currency.format(summary.estimatedProfit),'OH&P / Fee financial lines'],
      ['PROJECTED GROSS PROFIT',currency.format(summary.projectedGrossProfit),summary.projectedMargin===null?'No selected budget':`${percent.format(summary.projectedMargin)} projected margin`],
    ];
    const gap=7;const cardWidth=(usable-gap*3)/4;const cardHeight=48;
    cards.forEach((card,index)=>{const column=index%4;const row=Math.floor(index/4);const x=margin+column*(cardWidth+gap);const top=y-row*(cardHeight+gap);page.drawRectangle({x,y:top-cardHeight,width:cardWidth,height:cardHeight,borderWidth:.6,borderColor:rgb(.79,.82,.84),color:rgb(.985,.988,.99)});text(card[0],x+7,top-12,5.7,bold,rgb(.36,.4,.44));text(card[1],x+7,top-27,10,bold,card[1].startsWith('-')?rgb(.68,.17,.12):rgb(.05,.14,.2));wrap(card[2],cardWidth-14,5.3).slice(0,2).forEach((line,lineIndex)=>text(line,x+7,top-39-lineIndex*6,5.3,normal,rgb(.35,.39,.43)));});
    y-=cardHeight*2+gap+14;
  };
  const tableHeader=()=>{
    page.drawRectangle({x:margin,y:y-14,width:usable,height:18,color:rgb(.94,.95,.96)});
    let x=margin;columns.forEach((column,index)=>{text(column.label,x+3,y-9,6.5,bold);x+=widths[index];});y-=20;
  };
  const header=(includeSummary=false)=>{
    page=pdf.addPage(pageSize);y=pageSize[1]-margin;
    text('NORTHGATE HQ',margin,y,9,bold,rgb(.74,.08,.1));y-=16;
    text(`Job Financial Report - ${job.job_number || ''} ${job.name || ''}`.trim(),margin,y,14,bold);y-=14;
    text(`Generated ${new Date().toLocaleString()} | Report scope: ${scopeLabel}`,margin,y,7,normal,rgb(.35,.39,.43));y-=18;
    if(includeSummary)drawSummary();
    tableHeader();
  };
  header(true);
  for(const row of rows){
    const lineSets=columns.map((column,index)=>moneyKeys.has(column.key)?[currency.format(amount(row[column.key]))]:wrap(row[column.key],widths[index]));
    const rowHeight=Math.max(17,Math.max(...lineSets.map((lines)=>lines.length))*8+6);
    if(y-rowHeight<38) header(false);
    let x=margin;
    columns.forEach((column,index)=>{
      lineSets[index].forEach((line,lineIndex)=>text(line,x+3,y-9-lineIndex*8,6.5,column.key==='costCode'?bold:normal));x+=widths[index];
    });
    page.drawLine({start:{x:margin,y:y-rowHeight+3},end:{x:margin+usable,y:y-rowHeight+3},thickness:.35,color:rgb(.82,.84,.86)});y-=rowHeight;
  }
  if(y<60) header(false);
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

export function openFinancialPrintPreview(content, previewWindow) {
  if (!previewWindow) throw new Error('The print preview was blocked. Allow pop-ups for Northgate HQ and try again.');
  const blob = new Blob([content], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  previewWindow.location.replace(url);
  // Keep the object URL available while the browser's PDF viewer is open.
  // It is only a temporary in-memory file and is released after a generous
  // review window instead of being downloaded automatically.
  setTimeout(() => URL.revokeObjectURL(url), 15 * 60 * 1000);
  return url;
}
