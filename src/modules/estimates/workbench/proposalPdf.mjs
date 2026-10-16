import {money} from './model.mjs';
import {sumPricing} from './pricing.mjs';
import {proposalFields,proposalScopeItems,proposalScopePrices} from './proposal.mjs';
import {proposalCharges} from './proposalCharges.mjs';
import {proposalBranding} from './proposalBranding.mjs';

export async function exportDraftProposalPdf(document){
 proposalCharges(0,document.proposal);
 return buildProposal(document,sumPricing(document.entries.flatMap(e=>e.items),document).price,{draft:true});
}
export async function exportApprovedProposalPdf(snapshot,{totalOnly=false}={}){
 if(!snapshot?.workbench_document)throw new Error('The approved Workbench snapshot is unavailable. Reopen the estimate and try again.');
 return buildProposal({...snapshot.workbench_document,name:snapshot.title||snapshot.workbench_document.name,customer:snapshot.customer_name||snapshot.workbench_document.customer},Number(snapshot.pricing_total),{date:snapshot.approved_at,totalOnly});
}
async function buildProposal(document,total,{draft=false,date,totalOnly=false}={}){
 const {PDFDocument,rgb,pushGraphicsState,popGraphicsState,concatTransformationMatrix}=await import('pdf-lib');
 const [{default:fontkit},assets]=await Promise.all([import('@pdf-lib/fontkit'),proposalBranding()]);
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 // Keep full font programs and disable discretionary ligatures: pdf-lib/fontkit's
 // subset mapping loses glyphs in Carlito, and full-font ligatures have wrong advances.
 const normal=await pdf.embedFont(assets.regular,{features:{liga:false}}),bold=await pdf.embedFont(assets.bold,{features:{liga:false}});
 const footer=await pdf.embedFont(assets.footer,{features:{liga:false}}),logo=await pdf.embedPng(assets.logo);
 const supported=new Set(normal.getCharacterSet());
 const dark=rgb(0,0,0),muted=rgb(.39,.43,.46),red=rgb(192/255,0,0);
 const margin=36,width=540;let page,y;
 // Normalize typographic punctuation, but never silently replace unsupported names with question marks.
 const clean=value=>{
  const text=String(value??'').replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\u2022/g,'-').replace(/\u2026/g,'...').replace(/\t/g,' ').replace(/\u00a0/g,' ');
  if([...text.replace(/[\r\n]/g,'')].some(char=>!supported.has(char.codePointAt(0))))throw new Error('The proposal contains characters this PDF font cannot display. Replace unsupported symbols before exporting.');return text;
 };
 const draw=(value,x,top,size=10,font=normal,color=dark)=>page.drawText(clean(value),{x,y:792-top-size,size,font,color});
 function newPage(){
  page=pdf.addPage([612,792]);
  // Original DOCX letterhead dimensions: 2.292 × 0.697 inches, half-inch margins.
  page.drawImage(logo,{x:margin,y:792-margin-50.17,width:165,height:50.17});
  if(draft)draw('DRAFT PROPOSAL',width+margin-bold.widthOfTextAtSize('DRAFT PROPOSAL',10),44,10,bold,red);
  y=101;
 }
 function ensure(height){if(y+height>724)newPage();}
 function wrap(value,size,font,maxWidth=width){
  const lines=[];
  for(const paragraph of clean(value).split(/\r?\n/)){let current='';for(const char of paragraph){if(font.widthOfTextAtSize(current+char,size)>maxWidth&&current){const space=current.lastIndexOf(' ');if(space>current.length/2){lines.push(current.slice(0,space));current=current.slice(space+1)+char;}else{lines.push(current);current=char;}}else current+=char;}lines.push(current);}
  return lines;
 }
 function paragraph(value,{size=11,font=normal,color=dark,gap=9,indent=0}={}){for(const line of wrap(value,size,font,width-indent)){ensure(size+5);draw(line,margin+indent,y,size,font,color);y+=size+5;}y+=gap;}
 function numbered(value,index,{gap=9}={}){
  const lines=wrap(value,11,normal,width-54);ensure(16);draw(`${index+1}.`,margin+36,y,11);
  for(const line of lines){ensure(16);draw(line,margin+54,y,11);y+=16;}y+=gap;
 }
 function section(title,value){if(!value?.trim())return;ensure(50);paragraph(title,{size:12,font:bold,gap:4});paragraph(value);}
 const fields=proposalFields(document);
 if(totalOnly)fields.showLinePrices=false;
 const proposalDate=fields.proposalDate?new Date(fields.proposalDate+'T12:00:00Z'):new Date(date||Date.now());
 if(!Number.isFinite(proposalDate.getTime()))throw new Error('Enter a valid proposal date.');
 newPage();paragraph(new Intl.DateTimeFormat('en-US',{dateStyle:'long',timeZone:'UTC'}).format(proposalDate));
 if(fields.contact)paragraph('Attention: '+fields.contact);
 if(document.customer)paragraph(document.customer);
 paragraph(document.name||'Proposal');
 if(fields.serviceCall)paragraph('Service call: '+fields.serviceCall);
 paragraph('Estimate version '+(document.revisionContext?.version||1),{size:9,color:muted});
 if(date)paragraph('Approved: '+new Intl.DateTimeFormat('en-US',{dateStyle:'long',timeZone:'America/New_York'}).format(new Date(date)),{size:9,color:muted});
 if(draft)paragraph('DRAFT - Review scope and pricing before approval.',{color:red});
 if(fields.siteAddress)paragraph('Project address: '+fields.siteAddress);
 if(fields.introduction)paragraph(fields.introduction);
 const charges=draft?sumPricing((document.entries||[]).flatMap(e=>e.items||[]),document):document.proposalChargeSnapshot;
 if(fields.scopeMode==='grouped'){
  const items=proposalScopeItems(document),prices=fields.showLinePrices?proposalScopePrices(document,charges?.preTaxTotal??total):null;
  items.forEach((item,index)=>{
   ensure(48);
   const price=prices?'  '+money(item.members.reduce((sum,line)=>sum+(prices.get(line.key)||0),0)):'';
   numbered(`${item.text}${price}`,index,{gap:5});
   if(item.grouped)paragraph('Included work: '+item.members.map(line=>line.text).join('; '),{indent:54,size:11,gap:12});
  });
 }else{
  const scope=fields.scope.trim();
  if(scope){ensure(50);paragraph('Scope of work',{size:12,font:bold,gap:4});
   scope.split(/\n\s*\n/).forEach((item,index)=>numbered(item.replace(/^\s*\d+[.)]\s*/,''),index));}
 }
 section('Included',fields.inclusions);section('Exclusions',fields.exclusions);section('Schedule',fields.schedule);
 ensure(charges&&(charges.salesTax||charges.creditCardFee)?126:62);y+=14;
 // Historical approved totals remain authoritative; new snapshots freeze the breakdown.
 if(charges&&(charges.salesTax||charges.creditCardFee)){
  paragraph('Subtotal before tax: '+money(charges.preTaxTotal),{gap:3});
  paragraph('Sales tax ('+(document.proposal?.salesTaxPercent??0)+'%): '+money(charges.salesTax),{gap:3});
  paragraph('Credit card fee ('+(document.proposal?.creditCardPercent??0)+'%): '+money(charges.creditCardFee),{gap:8});
 }
 paragraph('Total:  '+money(total),{size:16,font:bold,gap:22});
 section('Terms and conditions',fields.terms);
 const pages=pdf.getPages();pages.forEach((p,index)=>{
  // A compressed, embedded Liberation Sans keeps the source's narrow red footer without
  // distributing Microsoft's proprietary Arial Narrow font.
  for(const [text,x] of [['1403 Capital Blvd, Raleigh, NC 27603',36],['919-835-2769',272],['thenorthgategroup.com',411]]){
   p.pushOperators(pushGraphicsState(),concatTransformationMatrix(.78,0,0,1,x,36));
   p.drawText(text,{x:0,y:0,size:11,font:footer,color:red});p.pushOperators(popGraphicsState());
  }
  if(pages.length>1)p.drawText(`${index+1} / ${pages.length}`,{x:margin+width-normal.widthOfTextAtSize(`${index+1} / ${pages.length}`,8),y:19,size:8,font:normal,color:muted});
 });
 pdf.setTitle(`${document.name||'Northgate'} - ${draft?'Draft':'Approved'} proposal`);pdf.setAuthor('Northgate HQ');return pdf.save();
}
