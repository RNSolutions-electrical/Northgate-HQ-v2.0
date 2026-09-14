import {totals,money} from './model.mjs';
import {defaults,itemPricing,entryPricing,sumPricing,sectionPricing} from './pricing.mjs';

export function selectEntries(entries,scope,value,excluded=[]){
 return entries.filter(e=>(scope==='all'||(scope==='room'?e.location:e.section)===value)&&!excluded.includes(e.id));
}
export function takeoffRows(entries){
 const rows=new Map();
 for(const entry of entries)for(const item of entry.items)for(const line of item.lines){
  if(line.unit==='HR')continue;
  const qty=Number(line.qty)*(line.fixed?1:Number(item.qty));
  if(!qty)continue;
  const key=`${line.catalogueId||line.name.trim().toLowerCase()}|${line.unit}`;
  const row=rows.get(key)||{description:line.name,unit:line.unit,quantity:0};
  row.quantity+=qty;rows.set(key,row);
 }
 return [...rows.values()].map(r=>({...r,quantity:Number(r.quantity.toFixed(6))}));
}
export function entrySummary(entry,rate){
 const sum=entry.items.reduce((t,i)=>{const v=totals(i,rate);return {material:t.material+v.material,hours:t.hours+v.hours,total:t.total+v.total};},{material:0,hours:0,total:0});
 return {...sum,labor:sum.hours*rate};
}
export function csvCell(value){
 let text=String(value??'');
 // Vendor-facing CSV text must not become a spreadsheet formula on opening.
 if(typeof value!=='number'&&(/^[\s\uFEFF]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text)))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}
export function exportCsv(data,entries,options){
 let rows;
 if(options.kind==='project'){
  const baseline=defaults(data);
  rows=[['Project','Section / row','Base cost','Material markup baseline %','Material markup effective %','Material markup amount','Subtotal before fee','Fee %','Fee amount','Price component','Included quotes (already in section totals)','Data type']];
  for(const v of sectionPricing(entries,data)){const ids=entries.filter(e=>e.section===v.section).flatMap(e=>e.items.map(i=>i.quoteId));const quotes=(data.quotes||[]).filter(q=>ids.includes(q.id));rows.push([data.name,v.section,v.cost,baseline.material,v.material?v.materialMarkup/v.material*100:0,v.materialMarkup,v.subtotal,'','',v.subtotal,quotes.map(q=>q.name+' / '+q.vendor).join('; '),'Draft estimate']);}
  const total=sumPricing(entries.flatMap(e=>e.items),data);
  rows.push([data.name,'Fee','','','','','',baseline.fee,total.fee,total.fee,'','Draft estimate']);
 }else if(options.kind==='takeoff'){
  rows=[['Document','Project','Vendor','Reference','Requested date','Delivery / vendor notes','Material description','Quantity','Unit',...(options.purpose==='rfq'?['Supplier unit price','Lead time','Availability']:[])]];
  for(const r of takeoffRows(entries))rows.push([options.purpose==='rfq'?'Request for pricing - DRAFT':'Material order - DRAFT',data.name,options.vendor,options.reference,options.date,options.notes,r.description,r.quantity,r.unit,...(options.purpose==='rfq'?['','','']:[])]);
 }else{
  rows=[['Project','Entry','Location','Section','Description','Drawing','Material cost','Labor hours','Labor cost','Total estimated cost','Material markup','Subtotal before fee','Data type']];
  for(const e of entries){const p=entryPricing(e,data);rows.push([data.name,'Entry '+String(e.number).padStart(3,'0'),e.location,e.section,e.name,e.drawing,p.material,Number(p.hours.toFixed(4)),p.labor,p.cost,p.materialMarkup,p.subtotal,'Draft estimate']);}
 }
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
export function exportFilename(data,options,scopeLabel){
 const safe=`${data.name}-${options.kind==='takeoff'?options.purpose:options.kind==='project'?'project-breakdown':'estimate-summary'}-${scopeLabel}`.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/[. ]+$/,'').slice(0,140);
 return `${safe||'northgate-export'}.${options.format}`;
}
export async function exportPdf(data,entries,options,scopeLabel){
 const {PDFDocument,StandardFonts,rgb}=await import('pdf-lib');
 const doc=await PDFDocument.create();
 const normal=await doc.embedFont(StandardFonts.Helvetica);const bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const dark=rgb(.13,.16,.18),muted=rgb(.39,.43,.46),red=rgb(.7,.15,.18),rule=rgb(.86,.88,.9);
 const logo=globalThis.prototypeLogo?await doc.embedJpg(globalThis.prototypeLogo):null;
 const title=options.kind==='estimate'?'Estimate summary':options.kind==='project'?'Project breakdown':options.purpose==='rfq'?'Request for pricing':'Material order';
 doc.setTitle(`${data.name} - ${title}`);doc.setAuthor('Northgate HQ');
 const margin=42,width=528;let page,y;
 function clean(value){return [...String(value??'').replace(/[\r\n\t]+/g,' ')].map(c=>{try{normal.encodeText(c);return c;}catch{return '?';}}).join('');}
 function wrap(value,maxWidth,size=10,font=normal){
  const result=[];let current='';
  for(const char of clean(value)){
   if(font.widthOfTextAtSize(current+char,size)>maxWidth&&current){const space=current.lastIndexOf(' ');if(space>current.length/2){result.push(current.slice(0,space));current=current.slice(space+1)+char;}else{result.push(current);current=char;}}
   else current+=char;
  }
  result.push(current);return result;
 }
 function text(value,x,top,size=10,font=normal,color=dark){page.drawText(clean(value),{x,y:792-top-size,size,font,color});}
 function newPage(){
  page=doc.addPage([612,792]);
  page.drawRectangle({x:margin,y:758,width,height:3,color:red});
  if(logo){const fitted=logo.scaleToFit(100,34);page.drawImage(logo,{x:margin,y:710,width:fitted.width,height:fitted.height});}
  else text('NORTHGATE HQ',margin,46,14,bold);
  text(title,margin+180,45,18,bold);
  text('DRAFT ESTIMATE',margin+180,70,8,bold,muted);
  y=105;
 }
 function ensure(height){if(y+height>738)newPage();}
 function paragraph(value,{size=10,font=normal,color=dark,gap=8}={}){
  for(const line of wrap(value,width,size,font)){ensure(size+5);text(line,margin,y,size,font,color);y+=size+5;}y+=gap;
 }
 function table(headers,rows,widths){
  function heading(){ensure(32);page.drawRectangle({x:margin,y:792-y-25,width,height:25,color:rgb(.94,.95,.96)});let x=margin;headers.forEach((h,i)=>{text(h,x+6,y+8,8,bold,muted);x+=widths[i];});y+=29;}
  heading();
  for(const row of rows){
   const cells=row.map((v,i)=>wrap(v,widths[i]-12,9));const lineCount=Math.max(...cells.map(c=>c.length));let start=0;
   while(start<lineCount){
    if(y+26>738){newPage();heading();}
    const count=Math.min(lineCount-start,Math.floor((738-y-10)/13));
    let x=margin;cells.forEach((lines,i)=>{lines.slice(start,start+count).forEach((line,j)=>text(line,x+6,y+5+j*13,9));x+=widths[i];});
    y+=count*13+10;page.drawLine({start:{x:margin,y:792-y},end:{x:margin+width,y:792-y},thickness:.5,color:rule});start+=count;
   }
  }
  y+=15;
 }
 newPage();paragraph(data.name,{size:16,font:bold});paragraph(scopeLabel+' | '+entries.length+' selected entries',{size:10,color:muted});
 if(options.kind==='project'){
  const p=sumPricing(entries.flatMap(e=>e.items),data),baseline=defaults(data);
  paragraph('Total estimate price: '+money(p.price),{size:16,font:bold});
  paragraph('Base cost: '+money(p.cost)+' | OH&P / price: '+p.margin.toFixed(2)+'%',{color:muted});
  table(['MARKUP','BASELINE','AMOUNT'],[['Material only',baseline.material+'%',money(p.materialMarkup)],['Fee (on subtotal after material markup)',baseline.fee+'%',money(p.fee)]],[318,90,120]);
  paragraph('Section breakdown',{size:12,font:bold});
  table(['SECTION','COST','MAT. M/U','BEFORE FEE'],sectionPricing(entries,data).map(s=>[s.section,money(s.cost),money(s.materialMarkup),money(s.subtotal)]),[228,100,100,100]);
  paragraph('Subtotal: '+money(p.subtotal)+' | Fee ('+baseline.fee+'%): '+money(p.fee),{font:bold});
  const included=entries.flatMap(e=>e.items.filter(i=>i.quoteId).map(i=>({item:i,entry:e,quote:(data.quotes||[]).find(q=>q.id===i.quoteId)}))).filter(x=>x.quote);
  ensure(90);paragraph('Quotes included in section totals',{size:12,font:bold});
  if(included.length)table(['QUOTE / VENDOR','SECTION','COST','MAT. M/U','BEFORE FEE'],included.map(({item,entry,quote})=>{const v=itemPricing(item,data);return [quote.name+' / '+quote.vendor,entry.section,money(v.cost),money(v.markup),money(v.price)];}),[196,92,80,80,80]);
  else paragraph('No quotes included in this selection.',{color:muted});
  const overrides=entries.flatMap(e=>e.items.filter(i=>i.materialMarkupOverride!=null).map(i=>({i,e})));
  if(overrides.length){ensure(90);paragraph('Markup overrides',{size:12,font:bold});table(['WORK ITEM','MATERIAL %'],overrides.map(({i,e})=>[String(e.number).padStart(3,'0')+'.'+i.number+' '+i.name,i.materialMarkupOverride??'Default']),[408,120]);}
  paragraph('Section totals include the quoted packages above; do not add quotes a second time. OH&P is not net profit; tax is excluded.',{size:9,color:muted});
 }else if(options.kind==='takeoff'){
  paragraph(`Vendor: ${options.vendor||'____________________'}    Reference: ${options.reference||'____________________'}`);
  if(options.date)paragraph('Requested date: '+options.date);
  if(options.notes)paragraph('Delivery / vendor notes: '+options.notes);
  const rows=takeoffRows(entries);
  if(options.purpose==='rfq')table(['MATERIAL','QTY','UNIT','UNIT PRICE','LEAD TIME'],rows.map(r=>[r.description,r.quantity,r.unit,'','']),[278,50,40,80,80]);
  else table(['MATERIAL','QUANTITY','UNIT'],rows.map(r=>[r.description,r.quantity,r.unit]),[388,80,60]);
  paragraph(`${rows.length} material lines.`,{color:muted});
 }else{
  const total=sumPricing(entries.flatMap(e=>e.items),data);
  for(const entry of entries){
   ensure(140);const s=entryPricing(entry,data);
   paragraph(`Entry ${String(entry.number).padStart(3,'0')} | ${entry.location} | ${entry.section}`,{size:12,font:bold});
   if(entry.name||entry.drawing)paragraph([entry.name,entry.drawing].filter(Boolean).join(' | '),{color:muted});
   paragraph('Material: '+money(s.material)+' | Labor: '+money(s.labor)+' | Other: '+money(s.other),{size:9,color:muted});
   table(['BASE COST','MATERIAL M/U','SUBTOTAL BEFORE FEE'],[[money(s.cost),money(s.materialMarkup),money(s.subtotal)]],[176,176,176]);
   if(options.includeItems&&entry.items.length)table(['WORK ITEM','QTY','COST','MAT. M/U','BEFORE FEE'],entry.items.map(i=>{const v=itemPricing(i,data);return [`${String(entry.number).padStart(3,'0')}.${i.number} ${i.name}`,i.qty,money(v.cost),money(v.markup),money(v.price)];}),[236,40,84,84,84]);
   if(!entry.items.length)paragraph('No work items entered.',{color:muted});
  }
  ensure(100);paragraph('Subtotal before fee: '+money(total.subtotal));paragraph('Fee ('+defaults(data).fee+'%): '+money(total.fee));paragraph('Selected estimate price: '+money(total.price),{size:14,font:bold});
  paragraph('Internal pricing summary. Includes OH&P and overrides; excludes tax.',{size:9,color:muted});
 }
 const pages=doc.getPages();pages.forEach((p,index)=>{p.drawLine({start:{x:margin,y:36},end:{x:570,y:36},thickness:.5,color:rule});p.drawText('Northgate HQ | Draft - review before bidding or ordering',{x:margin,y:22,size:8,font:normal,color:muted});p.drawText(`${index+1} / ${pages.length}`,{x:540,y:22,size:8,font:normal,color:muted});});
 return doc.save();
}

/** Builds a client-safe proposal only from the immutable approval snapshot. */
export async function exportApprovedProposalPdf(snapshot){
 const document=snapshot?.workbench_document;
 if(!document)throw new Error('The approved Workbench snapshot is unavailable. Reopen the estimate and try again.');
 const {PDFDocument,StandardFonts,rgb}=await import('pdf-lib');
 const pdf=await PDFDocument.create();
 const normal=await pdf.embedFont(StandardFonts.Helvetica);
 const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const dark=rgb(.13,.16,.18),muted=rgb(.39,.43,.46),red=rgb(.7,.15,.18),rule=rgb(.86,.88,.9);
 const page=pdf.addPage([612,792]);const margin=48;let y=74;
 const clean=value=>String(value??'').replace(/[\r\n\t]+/g,' ').replace(/[^ -~]/g,'?');
 const draw=(value,x,top,size=10,font=normal,color=dark)=>page.drawText(clean(value),{x,y:792-top-size,size,font,color});
 const wrap=(value,width,size=10,font=normal)=>{
  const words=clean(value).split(/\s+/);const lines=[];let line='';
  for(const word of words){const next=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(next,size)>width&&line){lines.push(line);line=word;}else line=next;}
  if(line)lines.push(line);return lines;
 };
 const paragraph=(value,{size=10,font=normal,color=dark,gap=8}={})=>{
  for(const line of wrap(value,516,size,font)){draw(line,margin,y,size,font,color);y+=size+5;}y+=gap;
 };
 const date=snapshot.approved_at?new Intl.DateTimeFormat('en-US',{dateStyle:'long'}).format(new Date(snapshot.approved_at)):'';
 page.drawRectangle({x:margin,y:758,width:516,height:3,color:red});
 draw('NORTHGATE GROUP',margin,42,16,bold);
 draw('PROPOSAL',margin+390,44,12,bold,red);
 draw(date,margin+390,62,8,normal,muted);
 y=102;
 paragraph(snapshot.title||document.name,{size:20,font:bold,gap:4});
 if(snapshot.customer_name||document.customer)paragraph(`Prepared for: ${snapshot.customer_name||document.customer}`,{size:11,color:muted,gap:14});
 paragraph('Scope of work',{size:12,font:bold,gap:6});
 const entries=Array.isArray(document.entries)?document.entries:[];
 if(entries.length){
  for(const entry of entries){
   const heading=[entry.section,entry.location,entry.name].filter(Boolean).join(' — ')||'Scope item';
   if(y>690){break;}
   paragraph(`• ${heading}`,{size:10,gap:3});
  }
 }else paragraph('Scope details are included in the approved estimate.',{color:muted});
 if(y>660){draw('See approved estimate record for the complete scope of work.',margin,682,9,normal,muted);y=704;}
 page.drawLine({start:{x:margin,y:792-y},end:{x:564,y:792-y},thickness:.75,color:rule});y+=16;
 draw('TOTAL PROPOSAL',margin,y,10,bold,muted);
 draw(money(Number(snapshot.pricing_total||0)),430,y-4,20,bold);
 y+=42;
 const terms=document.proposalTerms?.trim();
 if(terms){paragraph('Proposal notes',{size:10,font:bold,gap:4});paragraph(terms,{size:9,color:muted,gap:0});}
 page.drawLine({start:{x:margin,y:36},end:{x:564,y:36},thickness:.5,color:rule});
 draw('Northgate Group · Approved proposal',margin,758,8,normal,muted);
 draw(`Approved ${date||'date unavailable'}`,420,758,8,normal,muted);
 pdf.setTitle(`${snapshot.title||document.name||'Northgate proposal'} - Approved proposal`);
 pdf.setAuthor('Northgate HQ');
 return pdf.save();
}
export function downloadFile(content,mime,filename){
 const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
