import { Download, FileSpreadsheet, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { buildFinancialExportRows, downloadFinancialFile, FINANCIAL_EXPORT_OPTIONS, financialExportCsv, financialExportPdf } from './jobFinancialExport.mjs';

const initial=Object.fromEntries(FINANCIAL_EXPORT_OPTIONS.map(([key])=>[key,true]));
const safe=value=>String(value||'job').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();

export function FinancialExportDialog({ open, onClose, job, lines, changeOrderByLineId }) {
 const [selected,setSelected]=useState(initial);
 const [working,setWorking]=useState('');
 const [error,setError]=useState('');
 const rows=useMemo(()=>buildFinancialExportRows(lines,changeOrderByLineId),[lines,changeOrderByLineId]);
 if(!open)return null;
 const chosen=Object.values(selected).some(Boolean);
 const filename=`northgate-${safe(job?.job_number||job?.name)}-financials-${new Date().toISOString().slice(0,10)}`;
 async function exportFile(format){
  if(!chosen||working)return;setWorking(format);setError('');
  try{
   if(format==='csv')downloadFinancialFile(financialExportCsv(rows,selected),filename+'.csv','text/csv;charset=utf-8');
   else downloadFinancialFile(await financialExportPdf({job,rows,selected}),filename+'.pdf','application/pdf');
  }catch(e){setError(e.message||'Financial export could not be created.');}
  finally{setWorking('');}
 }
 return <div className="ng-dialog-root"><div className="ng-dialog-scrim is-open"/><section className="ng-dialog financial-export-dialog" role="dialog" aria-modal="true" aria-labelledby="financial-export-title">
  <header className="ng-dialog__header"><div><span className="eyebrow">Financials</span><h3 id="financial-export-title">Export job financials</h3><p className="ng-dialog__description">Cost code and description are always included. Select the financial details to add.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close financial export"><X/></button></header>
  <div className="financial-export-options">{FINANCIAL_EXPORT_OPTIONS.map(([key,label])=><label key={key}><input type="checkbox" checked={selected[key]} onChange={event=>setSelected(current=>({...current,[key]:event.target.checked}))}/><span>{label}</span></label>)}</div>
  <p className="muted-copy">{rows.length} authorized financial line{rows.length===1?'':'s'} will be exported.</p>
  {error?<p className="form-error" role="alert">{error}</p>:null}
  <footer className="ng-dialog__actions"><button type="button" className="ng-dialog__button" onClick={onClose}>Cancel</button><button type="button" className="ng-dialog__button" disabled={!chosen||!!working} onClick={()=>exportFile('csv')}><FileSpreadsheet/> {working==='csv'?'Creating…':'Export CSV'}</button><button type="button" className="ng-dialog__button ng-dialog__button--primary" disabled={!chosen||!!working} onClick={()=>exportFile('pdf')}><Download/> {working==='pdf'?'Creating…':'Export PDF'}</button></footer>
 </section></div>;
}
