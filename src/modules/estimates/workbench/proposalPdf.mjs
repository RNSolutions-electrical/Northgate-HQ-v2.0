import {money} from './model.mjs';
import {sumPricing} from './pricing.mjs';
import {proposalFields} from './proposal.mjs';

export async function exportDraftProposalPdf(document){
 return buildProposal(document,sumPricing(document.entries.flatMap(e=>e.items),document).price,{draft:true});
}
export async function exportApprovedProposalPdf(snapshot){
 if(!snapshot?.workbench_document)throw new Error('The approved Workbench snapshot is unavailable. Reopen the estimate and try again.');
 return buildProposal({...snapshot.workbench_document,name:snapshot.title||snapshot.workbench_document.name,customer:snapshot.customer_name||snapshot.workbench_document.customer},Number(snapshot.pricing_total),{date:snapshot.approved_at});
}
async function buildProposal(document,total,{draft=false,date}={}){
 const {PDFDocument,StandardFonts,rgb}=await import('pdf-lib');
 const pdf=await PDFDocument.create(),normal=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const dark=rgb(.13,.16,.18),muted=rgb(.39,.43,.46),red=rgb(.7,.15,.18),rule=rgb(.86,.88,.9);
 const margin=48,width=516;let page,y;
 // Normalize typographic punctuation, but never silently replace unsupported names with question marks.
 const clean=value=>{
  const text=String(value??'').replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\u2022/g,'-').replace(/\u2026/g,'...').replace(/\t/g,' ').replace(/\u00a0/g,' ');
  try{normal.encodeText(text.replace(/[\r\n]/g,''));}catch{throw new Error('The proposal contains characters this PDF font cannot display. Replace unsupported symbols before exporting.');}return text;
 };
 const draw=(value,x,top,size=10,font=normal,color=dark)=>page.drawText(clean(value),{x,y:792-top-size,size,font,color});
 function newPage(){page=pdf.addPage([612,792]);page.drawRectangle({x:margin,y:758,width,height:3,color:red});draw('NORTHGATE GROUP',margin,44,15,bold);draw(draft?'DRAFT PROPOSAL':'PROPOSAL',395,46,11,bold,red);y=92;}
 function ensure(height){if(y+height>732)newPage();}
 function wrap(value,size,font){
  const lines=[];
  for(const paragraph of clean(value).split(/\r?\n/)){let current='';for(const char of paragraph){if(font.widthOfTextAtSize(current+char,size)>width&&current){const space=current.lastIndexOf(' ');if(space>current.length/2){lines.push(current.slice(0,space));current=current.slice(space+1)+char;}else{lines.push(current);current=char;}}else current+=char;}lines.push(current);}
  return lines;
 }
 function paragraph(value,{size=10,font=normal,color=dark,gap=9}={}){for(const line of wrap(value,size,font)){ensure(size+5);draw(line,margin,y,size,font,color);y+=size+5;}y+=gap;}
 function section(title,value){if(!value?.trim())return;ensure(50);paragraph(title,{size:12,font:bold,gap:4});paragraph(value);}
 newPage();paragraph(document.name||'Proposal',{size:20,font:bold});
 paragraph('Estimate version '+(document.revisionContext?.version||1),{size:9,color:muted});
 if(document.customer)paragraph('Prepared for: '+document.customer,{color:muted});
 if(date)paragraph('Approved: '+new Intl.DateTimeFormat('en-US',{dateStyle:'long',timeZone:'America/New_York'}).format(new Date(date)),{size:9,color:muted});
 if(draft)paragraph('DRAFT - Review scope and pricing before approval.',{color:red});
 const fields=proposalFields(document);
 if(fields.contact)paragraph('Attention: '+fields.contact);
 if(fields.siteAddress)paragraph('Project address: '+fields.siteAddress);
 if(fields.introduction)paragraph(fields.introduction);
 section('Scope of work',fields.scope);
 section('Included',fields.inclusions);section('Exclusions',fields.exclusions);section('Schedule',fields.schedule);
 ensure(75);page.drawLine({start:{x:margin,y:792-y},end:{x:564,y:792-y},thickness:.75,color:rule});y+=14;
 paragraph('TOTAL PROPOSAL',{size:10,font:bold,color:muted,gap:4});paragraph(money(total),{size:22,font:bold,gap:16});
 section('Terms and conditions',fields.terms);
 const pages=pdf.getPages();pages.forEach((p,index)=>{p.drawLine({start:{x:margin,y:36},end:{x:564,y:36},thickness:.5,color:rule});p.drawText(draft?'Northgate Group | Draft - not approved':'Northgate Group | Approved proposal',{x:margin,y:22,size:8,font:normal,color:muted});p.drawText(`${index+1} / ${pages.length}`,{x:530,y:22,size:8,font:normal,color:muted});});
 pdf.setTitle(`${document.name||'Northgate'} - ${draft?'Draft':'Approved'} proposal`);pdf.setAuthor('Northgate HQ');return pdf.save();
}
