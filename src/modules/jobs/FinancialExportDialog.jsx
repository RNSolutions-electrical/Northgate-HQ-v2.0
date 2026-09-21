import { FileSearch, FileSpreadsheet, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { buildFinancialExportRows, downloadFinancialFile, filterFinancialExportRows, FINANCIAL_EXPORT_OPTIONS, financialExportCsv, financialExportDivisions, financialExportPdf, openFinancialPrintPreview } from './jobFinancialExport.mjs';

const initial=Object.fromEntries(FINANCIAL_EXPORT_OPTIONS.map(([key])=>[key,true]));
const safe=value=>String(value||'job').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();

export function FinancialExportDialog({ open, onClose, job, lines, changeOrderByLineId }) {
 const [selected,setSelected]=useState(initial);
 const [working,setWorking]=useState('');
 const [error,setError]=useState('');
 const rows=useMemo(()=>buildFinancialExportRows(lines,changeOrderByLineId),[lines,changeOrderByLineId]);
 const divisions=useMemo(()=>financialExportDivisions(rows),[rows]);
 const divisionSignature=divisions.map(({key})=>key).join('|');
 const [selectedDivisions,setSelectedDivisions]=useState(new Set());
 useEffect(()=>{
  if(open)setSelectedDivisions(new Set(divisions.map(({key})=>key)));
 },[open,job?.id,divisionSignature]);
 const exportRows=useMemo(()=>filterFinancialExportRows(rows,selectedDivisions),[rows,selectedDivisions]);
 if(!open)return null;
 const chosen=Object.values(selected).some(Boolean);
 const hasDivisions=selectedDivisions.size>0;
 const filename=`northgate-${safe(job?.job_number||job?.name)}-financials-${new Date().toISOString().slice(0,10)}`;
 async function exportFile(format){
  if(!chosen||!hasDivisions||working)return;setWorking(format);setError('');
  const previewWindow=format==='pdf'?window.open('','_blank'):null;
  if(previewWindow){previewWindow.document.title='Preparing financial report…';previewWindow.document.body.textContent='Preparing financial report preview…';}
  try{
   if(format==='csv')downloadFinancialFile(financialExportCsv(exportRows,selected),filename+'.csv','text/csv;charset=utf-8');
   else openFinancialPrintPreview(await financialExportPdf({job,rows:exportRows,selected}),previewWindow);
  }catch(e){previewWindow?.close();setError(e.message||'Financial export could not be created.');}
  finally{setWorking('');}
 }
 return <div className="ng-dialog-root"><div className="ng-dialog-scrim is-open"/><section className="ng-dialog financial-export-dialog" role="dialog" aria-modal="true" aria-labelledby="financial-export-title">
  <header className="ng-dialog__header"><div><span className="eyebrow">Financials</span><h3 id="financial-export-title">Export job financials</h3><p className="ng-dialog__description">Cost code and description are always included. Select the financial details to add.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close financial export"><X/></button></header>
  <div className="financial-export-section"><div className="financial-export-section__heading"><div><span className="eyebrow">Project divisions</span><h4>Select divisions to export</h4></div><div className="financial-export-quick-actions"><button type="button" className="text-button" onClick={()=>setSelectedDivisions(new Set(divisions.map(({key})=>key)))}>Select all</button><button type="button" className="text-button" onClick={()=>setSelectedDivisions(new Set())}>Clear</button></div></div><div className="financial-export-divisions">{divisions.map((division)=><label key={division.key}><input type="checkbox" checked={selectedDivisions.has(division.key)} onChange={(event)=>setSelectedDivisions(current=>{const next=new Set(current);if(event.target.checked)next.add(division.key);else next.delete(division.key);return next;})}/><span><strong>{division.label}</strong><small>{division.lineCount} financial line{division.lineCount===1?'':'s'}</small></span></label>)}</div></div>
  <div className="financial-export-section"><div className="financial-export-section__heading"><div><span className="eyebrow">Report fields</span><h4>Select financial details</h4></div></div><div className="financial-export-options">{FINANCIAL_EXPORT_OPTIONS.map(([key,label])=><label key={key}><input type="checkbox" checked={selected[key]} onChange={event=>setSelected(current=>({...current,[key]:event.target.checked}))}/><span>{label}</span></label>)}</div></div>
  <p className="muted-copy">{exportRows.length} of {rows.length} authorized financial line{rows.length===1?'':'s'} will be exported. PDF opens in a preview tab so you can review it, return here to revise the selections, or print/save it when ready.</p>
  {!hasDivisions?<p className="form-error" role="alert">Select at least one project division.</p>:null}
  {error?<p className="form-error" role="alert">{error}</p>:null}
  <footer className="ng-dialog__actions"><button type="button" className="ng-dialog__button" onClick={onClose}>Cancel</button><button type="button" className="ng-dialog__button" disabled={!chosen||!hasDivisions||!!working} onClick={()=>exportFile('csv')}><FileSpreadsheet/> {working==='csv'?'Creating…':'Export CSV'}</button><button type="button" className="ng-dialog__button ng-dialog__button--primary" disabled={!chosen||!hasDivisions||!!working} onClick={()=>exportFile('pdf')}><FileSearch/> {working==='pdf'?'Creating preview…':'Preview / Print PDF'}</button></footer>
 </section></div>;
}
