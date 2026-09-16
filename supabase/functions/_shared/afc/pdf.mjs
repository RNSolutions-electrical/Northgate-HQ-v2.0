import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {comparison,SOURCE_URL} from './model.mjs';
export const RENDERER_VERSION='northgate-afc-pdf/1';
const printable=v=>String(v??'').replace(/3Ø/g,'3-phase').replace(/[–—]/g,'-').replace(/√3/g,'sqrt(3)').replace(/″/g,'"').replace(/[^\x20-\x7e\xa0-\xff\n]/gu,c=>'[U+'+c.codePointAt(0).toString(16).toUpperCase()+']');
const amps=n=>Math.ceil(n).toLocaleString('en-US');
export const LIMITATIONS='Scalar radial estimate, 1-600 V. Highest entered/modeled case is an envelope, not a determination of the governing fault. No arc-flash, coordination, asymmetrical duty, protective-device let-through or equipment-suitability approval. Motor screening omits attenuation, decay, phase angles and network diversion. L-N estimates are source-only; no modeled L-G or parallel-source network.';
export async function afcPdf({document,results,revision,kind='report',nodeIds=null}){
 if(results.errors?.length)throw Error('Resolve calculation inputs before generating a new report or label.');
 const pdf=await PDFDocument.create(),regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const stamp=new Date(revision?.reviewed_at||'2000-01-01T00:00:00Z');
 pdf.setCreationDate(stamp);pdf.setModificationDate(stamp);pdf.setTitle(document.title+' - AFC '+kind);pdf.setAuthor(document.preparedBy);pdf.setProducer(RENDERER_VERSION);
 const ink=rgb(.13,.17,.22),red=rgb(.68,.12,.14),muted=rgb(.38,.42,.47);
 const advance=(text,size,font=regular)=>[...printable(text)].reduce((s,c)=>s+font.widthOfTextAtSize(c,size),0);
 const wrap=(value,width,size=9,font=regular)=>{
  const lines=[];for(const paragraph of printable(value).split('\n')){let line='';for(let word of paragraph.split(/\s+/).filter(Boolean)){
   if(line&&advance(line+' '+word,size,font)>width){lines.push(line);line='';}
   while(advance(word,size,font)>width){let end=1;while(end<word.length&&advance(word.slice(0,end+1),size,font)<=width)end++;lines.push(word.slice(0,end));word=word.slice(end);}
   line+=(line?' ':'')+word;
  }lines.push(line);}return lines;
 };
 const status=revision?'Reviewed revision '+revision.revision:'DRAFT - NOT RELEASED';
 const nodes=nodeIds?document.nodes.filter(n=>nodeIds.includes(n.id)):document.nodes;
 if(kind!=='report'){
  const dimensions=document.labelSize==='6x4'?[432,288]:[288,216],margin=14;
  for(const n of nodes){
   const max=results.byNode[n.id]?.maximum;if(!max)continue;const page=pdf.addPage(dimensions);let y=dimensions[1]-margin;
   const entries=[['AVAILABLE FAULT CURRENT',12,true],[n.name,12,true],[n.fault,9,false],[amps(max.amps)+' A RMS symmetrical',18,true],
    [max.fault+' | '+results.base[n.id].v+' V L-L | '+max.caseName,9,false],['Highest entered/modeled case',8,false],
    [document.date+' | '+document.reference,8,false],['Study: '+document.title+' / '+status,8,false],
    ['Prepared: '+document.preparedBy,8,false],['Fault-current label. Not an arc-flash label.',7,false]];
   for(const [value,size,isBold]of entries){const font=isBold?bold:regular,lines=wrap(value,dimensions[0]-2*margin,size,font);for(const line of lines){if(y-size<margin)throw Error('Label text is too long for '+(document.labelSize||'4x3')+'. Choose 6x4 or shorten label fields.');page.drawText(line,{x:margin,y:y-size,size,font,color:isBold?ink:muted});y-=size+2;}y-=3;}
  }
 }else{
  let page,y;const margin=42,width=528;
  const addPage=()=>{page=pdf.addPage([612,792]);y=741;page.drawText('NORTHGATE  /  ELECTRICAL',{x:margin,y:762,size:10,font:bold,color:red});page.drawText(status,{x:margin,y:28,size:8,font:bold,color:revision?muted:red});};
  const write=(value,size=9,isBold=false,indent=0)=>{
   const font=isBold?bold:regular;for(const line of wrap(value,width-indent,size,font)){if(y<size+65)addPage();page.drawText(line,{x:margin+indent,y:y-size,size,font,color:ink});y-=size+4;}y-=5;
  };
  addPage();write('Available Fault Current Study',24,true);write(document.title,17,true);write(document.reference,12);write('Calculation date: '+document.date+' | Prepared by: '+document.preparedBy);
  if(revision){write('Reviewed by: '+revision.reviewer_name+' | '+revision.reviewed_at);write('Reviewed scope and assumptions: '+revision.review_note);}
  write('Scope and interpretation',12,true);write(LIMITATIONS);
  write('Method: '+results.engineVersion+' | Data: '+results.dataVersion);write('C presets: Eaton 2014 Table 4, 600 V, three single conductors, steel/nonmagnetic. Confirm construction, frequency and temperature applicability.');write(SOURCE_URL,8);
  for(const note of results.notes||[])write(note,9);
  write('System map',14,true);
  const visit=(parent,depth)=>{for(const n of document.nodes.filter(n=>n.parent===parent||(parent===null&&n.kind==='source'))){write((depth?'-> ':'')+n.name+' / '+n.fault+' / '+(results.byNode[n.id]?.maximum?amps(results.byNode[n.id].maximum.amps)+' A':'Not calculated'),9,true,Math.min(depth*14,210));visit(n.id,depth+1);}};
  visit(null,0);
  for(const n of document.nodes){
   addPage();write(n.name,19,true);write(n.fault,12,true);const result=results.byNode[n.id],base=results.base[n.id];
   write('Fed from: '+(document.nodes.find(x=>x.id===n.parent)?.name||'Utility source'));write('Voltage: '+base.v+' V L-L / '+base.phase+' phase');write('Nameplate: '+(n.rating?n.rating+' kA':'Not entered')+' | '+comparison(n,result).label);
   write('Calculated and external cases',12,true);for(const row of result.rows)write(row.caseName+' / '+row.fault+': '+amps(row.amps)+' A RMS symmetrical\n'+row.basis+(row.motor?' / Motor screening contribution: '+amps(row.motor)+' A':''),10);
   if(n.kind==='source'||n.kind==='transformer')write('Source: '+n.sourceReference+'\nMethod: '+(n.method||'Downstream transformer')+'; known A: '+(n.known??'not entered')+'; kVA: '+(n.kva??'not entered')+'; Z%: '+(n.z??'not entered')+'; reduction%: '+(n.tolerance??'not entered'));
   if(n.ln)write('L-N source: '+JSON.stringify(n.ln));
   for(const [i,s]of(n.segments||[]).entries()){write('Incoming segment '+(i+1),11,true);write(s.length+' ft / '+s.sets+' parallel sets / '+(s.mode==='custom'?'Custom C '+s.c+' / '+s.reference:s.size+' '+s.material+' / '+s.raceway));write('Neutral: '+JSON.stringify(s.neutral||{mode:'none'}));const step=base.steps[i];if(step)write('C='+step.c+'; input '+step.input+' A; output '+step.output+' A',8);}
  }
  if(document.layers?.generators?.length||document.layers?.motors?.length){addPage();write('Optional source and motor inputs',15,true);for(const [key,items]of Object.entries(document.layers||{}))for(const item of items){write(key+' / '+(item.name||'Unnamed'),11,true);write(JSON.stringify(item),8);}}
  for(const [i,p]of pdf.getPages().entries())p.drawText((i+1)+' / '+pdf.getPageCount(),{x:532,y:28,size:8,font:regular,color:muted});
 }
 if(!pdf.getPageCount())throw Error('Select at least one calculated equipment item.');
 return pdf.save();
}
