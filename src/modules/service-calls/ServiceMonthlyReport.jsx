import { DataTable } from '../../components/ui/DataTable.jsx';
import { useState } from 'react';
import { uiElementAttributes } from '../../config/uiTerminology.js';
import { money } from './serviceCallModel.js';
import { monthlyServiceProfit } from './serviceScorecard.js';

export function ServiceMonthlyReport({calls,period,today}) {
  const [open,setOpen] = useState(false);
  return <details className="svc-section" onToggle={event=>setOpen(event.currentTarget.open)} {...uiElementAttributes('MODULE','Service Monthly Profit Report')}>
    <summary>Monthly profit report</summary>
    <p>Uses the selected year, quarter and reporting-date basis, through {today}. Includes archived calls; excludes void calls and calls without costs. Each call contributes its lifetime totals once, not monthly cash flow. Search and directory filters do not change this report.</p>
    {open && <DataTable rows={monthlyServiceProfit(calls,{...period,through:today})} getRowKey={row=>row.month} minWidth="700px" columns={[
      {key:'month',header:'Month'}, {key:'included',header:'Calls with costs'},
      ...[['revenue','Billed (ex tax)'],['cost','Cost'],['profit','Profit $'],['margin','Profit %']].map(([key,header])=>({key,header,render:row=>row[key] === null ? '—' : key==='margin' ? row[key].toFixed(1)+'%' : money(row[key])})),
      {key:'missingCost',header:'Missing costs'}, {key:'preliminary',header:'Preliminary'},
    ]} />}
  </details>;
}
