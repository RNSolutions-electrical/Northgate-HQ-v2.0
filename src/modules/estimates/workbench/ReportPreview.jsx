import React,{useMemo,useRef,useState} from 'react';
import {makeReport,reportHTML,reportCSV,reportKinds} from './reports.mjs';

export function downloadReportCSV(report){
  const url=URL.createObjectURL(new Blob([reportCSV(report)],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;
  anchor.download=report.kind==='rfq'?'northgate-rfq.csv':'northgate-takeoff.csv';
  anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

const descriptions={
  detail:'Complete hierarchy with component quantities, labor, costs, task markups, awarded quote values and internal notes.',
  field:'Material quantities, labor hours, locations, drawings and scope descriptions. Internal notes and pricing fields are excluded. Review free-text descriptions before sharing.',
  summary:'Scope and grand total first, followed by entry descriptions and subtotals. The estimate fee is shown separately so the total reconciles without changing pricing.',
  rfq:'Vendor-ready material list. Pricing and lead-time cells are blank for the vendor to complete. No assumed costs or estimate markups are exported.',
  takeoff:'Internal quantities, material costs and ordering status for the selected list.',
  proposal:'Northgate-styled client draft. Empty sections are omitted; internal costs and markup are excluded.'
};

export default function ReportPreview({data,kind:initialKind='detail',options={}}){
  const [kind,setKind]=useState(initialKind),[ready,setReady]=useState(false),[message,setMessage]=useState('');
  const frame=useRef();
  const report=useMemo(()=>makeReport(data,kind,options),[data,kind,options]);
  const html=useMemo(()=>reportHTML(report),[report]);
  const isPricing=['detail','field','summary'].includes(initialKind);
  return <section className="report-preview">
    <div className="report-toolbar">
      {isPricing&&<label>Report version<select value={kind} onChange={e=>{setReady(false);setKind(e.target.value);setMessage('');}}>{['detail','field','summary'].map(key=><option key={key} value={key}>{reportKinds[key]}</option>)}</select></label>}
      <div className="actions"><button type="button" className="primary" disabled={!ready} onClick={()=>{frame.current.contentWindow.focus();frame.current.contentWindow.print();setMessage('Choose a printer or Save as PDF in the print dialog.');}}>Print / Save PDF</button>{['rfq','takeoff'].includes(kind)&&<button onClick={()=>downloadReportCSV(report)}>Download CSV (Excel)</button>}</div>
    </div>
    <p className="report-description">{descriptions[kind]}</p>
    <p className="muted">Printing or downloading does not submit, approve or send this estimate.</p>
    {message&&<p role="status">{message}</p>}
    <iframe ref={frame} title={reportKinds[kind]+' document'} srcDoc={html} onLoad={()=>setReady(true)}/>
  </section>;
}
