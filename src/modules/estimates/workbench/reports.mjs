// Audience-specific report projections. Never serialize an estimate into a public report.
import {summary,itemValue,issues,invalid,takeoff} from './workspaceModel.mjs';
import {round} from './pricing.mjs';
import {componentGroups} from './componentStructure.mjs';

export const reportKinds={detail:'Detailed internal report',field:'Field work sheet',summary:'Internal estimate summary',rfq:'Request for Quote',takeoff:'Internal material takeoff',proposal:'Draft proposal'};
const number=v=>Number(v)||0;
const ref=v=>String(v).padStart(3,'0');
export const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v);
const qty=v=>new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(v);

export function takeoffSelection(data,{scope='',annotations={},exportMode='All visible items'}={}){
  // Filter source entries BEFORE aggregation so a section never exports another section's quantities.
  return takeoff({...data,entries:data.entries.filter(e=>!scope||e.section===scope)}).filter(r=>
    !annotations[r.key]?.hidden && (exportMode!=='Selected items'||annotations[r.key]?.selected)
    && (exportMode!=='Unordered visible items'||!annotations[r.key]?.ordered));
}

export function makeReport(data,kind,options={}){
  if(!reportKinds[kind])throw new Error('Unknown report type');
  const report={kind,title:reportKinds[kind],estimate:data.name,customer:data.customer,
    project:data.job?.number||'',address:data.job?.address||'',version:options.version||1,
    date:options.date||new Date().toLocaleDateString('en-US')};
  if(kind==='rfq'||kind==='takeoff'){
    report.selection=options.scope||'All sections';
    report.rows=takeoffSelection(data,options).map((r,index)=>kind==='rfq'
      ? {reference:String(index+1).padStart(3,'0'),description:r.name,quantity:r.qty,unit:r.unit,
        vendorUnitPrice:'',vendorTotal:'',leadTime:'',manufacturerPart:'',vendorNotes:''}
      : {reference:String(index+1).padStart(3,'0'),description:r.name,quantity:r.qty,unit:r.unit,cost:round(r.cost),ordered:!!options.annotations?.[r.key]?.ordered});
    return report;
  }
  if(kind==='proposal'){
    report.sections=[['contact','Attention'],['siteAddress','Project address'],['introduction','Introduction'],['scope','Scope of work'],['inclusions','Included'],['exclusions','Exclusions'],['schedule','Schedule'],['terms','Terms and conditions']]
      .filter(([key])=>data.proposal?.[key]?.trim()).map(([key,label])=>({label,text:data.proposal[key]}));
    report.total=summary(data).price;
    report.provisional=data.entries.some(e=>e.items.some(i=>issues(i).length));
    return report;
  }
  report.scope=data.proposal?.scope||data.scope||'';
  report.entries=data.entries.map(e=>{
    const entry={reference:ref(e.number),name:e.name,description:e.description||'',location:e.location||'',section:e.section||'',drawing:e.drawing||''};
    if(kind!=='field')entry.subtotal=round(e.items.reduce((sum,i)=>sum+itemValue(i,data).price,0));
    if(kind==='summary')return entry;
    entry.items=e.items.map(i=>{
      const p=itemValue(i,data),work={reference:ref(e.number)+'.'+i.number,name:i.name,quantity:i.qty,
        hours:p.hours,status:i.status||'',vendorScope:!!i.quoteId};
      // Field audience is an allowlist: no rate, cost, markup, quote price or internal notes.
      work.components=(i.lines||[]).map((l,index)=>{
        const multiplier=l.fixed?1:number(i.qty),extended=number(l.qty)*multiplier;
        const group=componentGroups(i).find(c=>c.lines.some(row=>row.id===l.id));
        const component={reference:work.reference+'.'+(group?.number||index+1)+(i.components?'.'+(group.lines.findIndex(row=>row.id===l.id)+1):''),description:i.components?group.name+' / '+l.name:l.name,
          quantity:invalid(l.qty)?null:extended,unit:l.unit,stage:l.stage||'',
          hours:invalid(l.hours)?null:number(l.hours)*extended};
        if(kind==='detail')Object.assign(component,{perItemQuantity:l.qty,fixed:!!l.fixed,
          hoursPerUnit:l.hours,unitCost:invalid(l.price)?null:number(l.price),
          materialCost:invalid(l.price)||invalid(l.qty)?null:round(extended*number(l.price)),notes:l.notes||''});
        return component;
      });
      if(kind==='detail'){
        const quote=(data.quotes||[]).find(q=>q.id===i.quoteId);
        Object.assign(work,{pricing:p,laborRate:i.laborRateOverride??data.rate,notes:i.notes||'',issues:issues(i),
          quote:quote?{vendor:quote.vendor,reference:quote.reference,name:quote.name}:null});
      }
      return work;
    });
    return entry;
  });
  if(kind!=='field'){
    report.totals=summary(data);report.materialMarkup=data.materialMarkup;report.feePercent=data.feePercent;
    report.provisional=data.entries.some(e=>e.items.some(i=>issues(i).length));
  }
  return report;
}

// Export editable vendor cells as true blanks. Guard spreadsheet formula injection in text cells.
export function csvCell(value){
  if(typeof value==='number')return Number.isFinite(value)?String(value):'';
  let text=String(value??'');
  if(/^[\s\u0000-\u001f]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function reportCSV(report){
  if(!['rfq','takeoff'].includes(report.kind))throw new Error('CSV is available for takeoff and RFQ');
  const header=report.kind==='rfq'
    ? ['Item','Description','Quantity','Unit','Vendor unit price','Vendor extended price','Lead time','Manufacturer / part','Vendor notes']
    : ['Item','Description','Quantity','Unit','Material cost','Ordered'];
  const rows=report.rows.map(r=>report.kind==='rfq'
    ? [r.reference,r.description,r.quantity,r.unit,'','','','','']
    : [r.reference,r.description,r.quantity,r.unit,r.cost,r.ordered?'Yes':'No']);
  // UTF-8 BOM keeps accented descriptions readable in Excel.
  return '\uFEFF'+[header,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n');
}

export const documentCSS=`
@page{size:letter;margin:0.55in 0.55in 0.6in}
*{box-sizing:border-box}body{margin:0;background:#edf0f2;color:#22282d;font:12px/1.5 Arial,Helvetica,sans-serif}
.paper{max-width:850px;margin:16px auto;padding:36px;background:white;box-shadow:0 2px 12px #20262b12}
header{border-top:5px solid #bb202d;padding-top:15px;display:flex;align-items:start;justify-content:space-between;gap:20px;border-bottom:1px solid #dfe3e7;padding-bottom:16px}
.brand{font:700 20px Georgia,serif;letter-spacing:1px}.brand small{font:10px Arial;letter-spacing:2px;display:block;margin-top:4px;color:#68717b}.doc-type{text-align:right;color:#a7202c;font-weight:700}
.meta{color:#5b6670;font-size:11px;margin:6px 0}.muted{color:#5b6670}h1{font:700 26px/1.2 Georgia,serif;margin:24px 0 9px}h2{font:700 17px Georgia,serif;margin:24px 0 10px}h3{font-size:13px;margin:17px 0 6px}p{margin:7px 0 12px;white-space:pre-wrap;overflow-wrap:anywhere}
.hero{display:flex;justify-content:space-between;align-items:center;gap:20px;background:#f7f8f9;border-left:4px solid #bb202d;padding:15px 18px;margin:20px 0}.hero strong{font-size:24px}.eyebrow{text-transform:uppercase;letter-spacing:.8px;font-size:10px;font-weight:bold;color:#68717b}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:11px;table-layout:fixed}thead{display:table-header-group}th{background:#f2f4f6;color:#5b6670;font-size:9px;letter-spacing:.3px;text-transform:uppercase}td,th{border-bottom:1px solid #dfe3e7;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}.num{text-align:right;font-variant-numeric:tabular-nums}td small{display:block;color:#68717b}tr{break-inside:avoid}h2,h3,.entry-head{break-after:avoid}h2+p,h3+p{break-before:avoid}
.entry{margin-top:26px}.entry-head{border-bottom:2px solid #bb202d;padding-bottom:8px}.entry-head h2{margin:0}.work{margin:16px 0 22px}.work-head{padding:9px 12px;background:#f3f5f6}.work-head h3{margin:0}.work-head .meta{margin-bottom:0}.totals{max-width:390px;margin:22px 0 0 auto}.totals div{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #dfe3e7;padding:7px 0}.totals .grand{border-top:2px solid #bb202d;font-size:16px;font-weight:700;margin-top:6px}.warning{padding:9px 12px;background:#fff7e8;border-left:3px solid #b27a22;color:#74480c}.notes{font-size:11px}.missing{color:#8d4c0b;font-weight:bold}.blank{height:40px}.vendor-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px 25px;margin:20px 0}.vendor-fields span{border-bottom:1px solid #aab1b7;padding:8px 0 16px;color:#5b6670}footer{border-top:1px solid #dfe3e7;margin-top:28px;padding-top:10px;color:#68717b;font-size:9px}
@media screen and (max-width:600px){.paper{padding:18px;margin:0}header{gap:12px}.brand{font-size:16px}.hero{align-items:start;flex-direction:column;gap:4px}table{font-size:10px}td,th{padding:5px}h1{font-size:22px}}
.work{break-inside:avoid}.work-head{break-after:avoid}.entry-head+p{break-after:avoid}.blank{height:24px}
@media print{body{background:white}.paper{max-width:none;margin:0;padding:0;box-shadow:none}header{break-inside:avoid}.hero,.totals,.vendor-fields{break-inside:avoid}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;
const h=escapeHTML;
const section=(label,text)=>text?`<section><h2>${h(label)}</h2><p>${h(text)}</p></section>`:'';
const table=(heads,rows,widths=[])=>`<table>${widths.length?'<colgroup>'+widths.map(w=>`<col style="width:${w}%">`).join('')+'</colgroup>':''}<thead><tr>${heads.map(x=>`<th>${h(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(cells=>'<tr>'+cells.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')}</tbody></table>`;
const value=(v,currency=false)=>v==null?'<span class="missing">Not entered</span>':h(currency?money(v):qty(v));
const scope=r=>section('Scope of work',r.scope);
const totals=r=>`<div class="totals"><div><span>Base cost</span><b>${h(money(r.totals.cost))}</b></div><div><span>Material markup (default ${h(r.materialMarkup)}%; task overrides retained)</span><b>${h(money(r.totals.materialMarkup))}</b></div><div><span>Entries subtotal before fee</span><b>${h(money(r.totals.subtotal))}</b></div><div><span>Fee (${h(r.feePercent)}%)</span><b>${h(money(r.totals.fee))}</b></div><div class="grand"><span>Grand total</span><b>${h(money(r.totals.price))}</b></div></div>`;

export function reportHTML(r){
  let body='';
  if(r.kind==='proposal'){
    body=r.sections.map(s=>section(s.label,s.text)).join('')+`<div class="hero"><span>Total proposal price</span><strong>${h(money(r.total))}</strong></div>`;
  }else if(r.kind==='rfq'||r.kind==='takeoff'){
    body=`<p class="meta">${h(r.selection)} · ${r.rows.length} material lines</p>`;
    if(r.kind==='rfq')body+=`<p>Please enter your unit prices, extended prices and lead times. Identify substitutions, freight, tax and exclusions separately. This request is not a purchase order.</p><div class="vendor-fields"><span>Vendor / contact</span><span>Quote reference / date</span><span>Pricing valid through</span><span>Freight / sales tax (separate)</span></div>`+table(['Item / description','Qty / unit','Vendor unit price','Vendor extended price','Lead time'],r.rows.map(x=>[h(x.reference)+'<br><b>'+h(x.description)+'</b>',h(qty(x.quantity)+' '+x.unit),'<div class="blank"></div>','','']),[36,13,17,19,15])+`<h2>Substitutions, manufacturer / part numbers and exclusions</h2><p>Reference the item numbers above. The CSV includes separate columns for these notes.</p><div class="blank"></div>`;
    else body+=table(['Item / description','Quantity','Unit','Material cost','Ordered'],r.rows.map(x=>[h(x.reference)+' · '+h(x.description),h(qty(x.quantity)),h(x.unit),h(money(x.cost)),x.ordered?'Yes':'No']),[42,15,10,20,13]);
  }else{
    if(r.kind!=='field')body+=`<div class="hero"><div><span class="eyebrow">Grand total proposal price</span><p class="meta">Entry subtotals plus the estimate fee</p></div><strong>${h(money(r.totals.price))}</strong></div>`;
    body+=scope(r);
    if(r.kind==='summary')body+=table(['Entry','Description','Entry subtotal before fee'],r.entries.map(e=>[h(e.reference)+'<br><b>'+h(e.name)+'</b>',h(e.description),h(money(e.subtotal))]),[33,44,23]);
    else body+=r.entries.map(e=>`<section class="entry"><div class="entry-head"><h2>${h(e.reference)} · ${h(e.name)}</h2><p class="meta">${[e.section,e.location,e.drawing&&'Drawing '+e.drawing].filter(Boolean).map(h).join(' · ')}</p></div>${e.description?'<p>'+h(e.description)+'</p>':''}${e.items.map(i=>`<section class="work"><div class="work-head"><h3>${h(i.reference)} · ${h(i.name)}</h3><p class="meta">${h(i.quantity)} work-item units · ${qty(i.hours)} labor hours${i.status?' · '+h(i.status):''}</p></div>${i.vendorScope?'<p>Vendor package scope. No component takeoff has been entered.</p>':''}${r.kind==='detail'&&i.quote?'<p>Awarded quote: '+h(i.quote.vendor)+' · '+h(i.quote.reference)+'</p>':''}${i.components.length?table(r.kind==='field'?['Component / description','Total qty / unit','Labor hours','Stage']:['Component / description','Total qty / unit','Unit cost','Material cost','Labor hours'],i.components.map(c=>r.kind==='field'?[h(c.reference)+'<br><b>'+h(c.description)+'</b>',value(c.quantity)+' '+h(c.unit),value(c.hours),h(c.stage)]:[h(c.reference)+'<br><b>'+h(c.description)+'</b><small>'+h(c.perItemQuantity)+' per work-item'+(c.fixed?' (fixed quantity)':'')+'</small>',value(c.quantity)+' '+h(c.unit),value(c.unitCost,true),value(c.materialCost,true),value(c.hours)+'<small>'+h(c.hoursPerUnit)+' per unit</small>']),r.kind==='field'?[46,20,15,19]:[34,16,16,18,16]):''}${r.kind==='detail'?`<p class="notes">Material ${h(money(i.pricing.material))} · Labor ${h(money(i.pricing.labor))} (${h(money(i.laborRate))}/hr) · Other ${h(money(i.pricing.other))}<br>Material markup ${h(i.pricing.materialRate)}%: ${h(money(i.pricing.materialMarkup))} · Work-item subtotal before fee: <b>${h(money(i.pricing.price))}</b></p>${i.notes?'<p class="notes">Work-item notes: '+h(i.notes)+'</p>':''}${i.components.filter(c=>c.notes).map(c=>'<p class="notes">'+h(c.reference)+' notes: '+h(c.notes)+'</p>').join('')}${i.issues.length?'<p class="warning">'+i.issues.map(h).join('; ')+'</p>':''}`:''}</section>`).join('')}${r.kind==='detail'?'<p><b>Entry subtotal before fee: '+h(money(e.subtotal))+'</b></p>':''}</section>`).join('');
    if(r.kind!=='field')body+=totals(r);
  }
  const audience=r.kind==='field'?'FIELD COPY':r.kind==='rfq'?'VENDOR COPY':r.kind==='proposal'?'CLIENT DRAFT':'INTERNAL USE';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(r.title+' — '+r.estimate)}</title><style>${documentCSS}</style></head><body><article class="paper"><header><div class="brand">NORTHGATE<small>THE NORTHGATE GROUP</small></div><div class="doc-type">${h(r.title)}<div class="meta">${audience} · VERSION ${h(r.version)}<br>${h(r.date)}</div></div></header><h1>${h(r.estimate)}</h1><p class="meta">${[r.customer,r.project].filter(Boolean).map(h).join(' · ')}</p>${r.provisional?'<p class="warning">Provisional draft: incomplete pricing remains. Review missing values before use.</p>':''}${body}<footer>Northgate HQ · ${h(r.title)} · Review before distribution</footer></article></body></html>`;
}
