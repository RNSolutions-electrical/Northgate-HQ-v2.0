import {amount} from './blankSlate.mjs';
import {proposalBranding} from './proposalBranding.mjs';

const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').trim();
const key=value=>clean(value).replace(/\s+/g,' ').normalize('NFKC').toLowerCase();
const unitPriceNote='Unit pricing is optional. Any line-item pricing you can share helps us bid accurately and creates more opportunities for us to work together.';
const hoursUnits=new Set(['h','hr','hrs','hour','hours','man hour','man-hour','person hour','person-hour']);
function decimal(value,label){
 amount(value,label);
 const [whole,tail='']=String(value).split('.');
 return [BigInt((whole||'0')+tail),tail.length];
}
function add([a,p],[b,q]){
 const scale=Math.max(p,q);
 return [a*10n**BigInt(scale-p)+b*10n**BigInt(scale-q),scale];
}
function exactText([n,scale]){
 const s=n.toString().padStart(scale+1,'0');
 return scale?(s.slice(0,-scale)+'.'+s.slice(-scale)).replace(/\.?0+$/,''):s;
}
const sameUnit=(material,unit)=>key(material?.unit??material?.unit_of_measure)===key(unit);
const partFor=(line,material)=>[line.partNumber,line.part_number,line.material_code,line.catalogueNumber,sameUnit(material,line.unit)?material?.material_code:''].map(clean).find(Boolean)||'';

/** This boundary only returns supplier-facing columns. It never copies estimate drafts or pricing. */
export function supplierRfqRows(document, catalogue=[]){
 const known=new Map(catalogue.map(material=>[material.id,material]));
 const map=new Map();
 for(const entry of document?.entries??[])for(const item of entry.items??[]){
  if(item.quoteId||(item.blankQuotes??[]).some(q=>q.mode==='replace'))continue;
  for(const line of item.lines??[]){
   if(line.blankResourceKind==='labor'||(!line.blankResourceKind&&!line.catalogueId&&hoursUnits.has(key(line.unit))))continue;
   const [l,p]=decimal(line.qty,'Material quantity'),[f,q]=line.fixed?[1n,0]:decimal(item.qty,'Work quantity');
   const qty=[l*f,p+q];if(qty[0]===0n)continue;
   const description=clean(line.name),unit=clean(line.unit),part=partFor(line,known.get(line.catalogueId));
   if(!description||!unit)throw Error('Add a description and unit to each included material before exporting a supplier request.');
   // Do not combine different known parts or different descriptions for a shared part.
   const group=JSON.stringify([key(description),key(part),key(unit)]);
   const prior=map.get(group);
   if(prior)prior.qty=add(prior.qty,qty);
   else map.set(group,{description,part,unit,qty});
  }
 }
 if(!map.size)throw Error('Add included materials before exporting a supplier request.');
 return [...map.values()].map(({description,part,unit,qty})=>({description,part,unit,quantity:exactText(qty)}));
}
const csvCell=value=>{
 let cell=clean(value);
 if(/^[\s\u200b-\u200f\u202a-\u202e\ufeff]*[=+\-@]/u.test(cell))cell="'"+cell;
 return '"'+cell.replace(/"/g,'""')+'"';
};
export function supplierRfqCsv(rows){
 const columns=['Material description','Internal Cat. #','Quantity','Unit','Supplier unit price (optional)','On hand (Yes/No)','Lead time (days)','Day basis (Business/Calendar)'];
 return '\ufeff'+[columns,...rows.map(({description,part,unit,quantity})=>[description,part,quantity,unit,'','','','']),[unitPriceNote,'','','','','','',''],['Supplier quote total','','','','','','','']]
  .filter(r=>r.length).map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}

export async function supplierRfqPdf(rows){
 const {PDFDocument,rgb}=await import('pdf-lib');
 const [{default:fontkit},brand]=await Promise.all([import('@pdf-lib/fontkit'),proposalBranding()]);
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 pdf.setTitle('Supplier material pricing request');pdf.setSubject('Supplier quote response');pdf.setAuthor('Northgate');
 const regular=await pdf.embedFont(brand.regular,{features:{liga:false}}),bold=await pdf.embedFont(brand.bold,{features:{liga:false}});
 const logo=await pdf.embedPng(brand.logo),form=pdf.getForm(),supported=new Set(regular.getCharacterSet());
 const dark=rgb(.11,.16,.2),border=rgb(.69,.74,.78),entry=rgb(.95,.98,1),head=rgb(.88,.91,.94),white=rgb(1,1,1);
 const margins=36,widths=[151,72,43,38,64,44,53,75],cols=[margins];
 for(const w of widths)cols.push(cols.at(-1)+w);
 const textValue=s=>{
  const t=clean(s).replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"');
  if([...t].some(c=>!supported.has(c.codePointAt(0))))throw Error('A material contains characters this PDF cannot show. Use the CSV or revise the material description.');
  return t;
 };
 function wrap(s,w){
  let lines=[],line='';
  for(const word of textValue(s).split(/\s+/)){
   if(!word)continue;
   const next=line?line+' '+word:word;
   if(regular.widthOfTextAtSize(next,9)<=w){line=next;continue;}
   if(line)lines.push(line);line='';
   for(const c of word){
    if(line&&regular.widthOfTextAtSize(line+c,9)>w){lines.push(line);line='';}
    line+=c;
   }
  }
  if(line)lines.push(line);return lines;
 }
 let page,y;
 const draw=(s,x,top,size=9,font=regular)=>page.drawText(s,{x,y:792-top-size,size,font,color:dark});
 function box(x,top,w,h,color=white){page.drawRectangle({x,y:792-top-h,width:w,height:h,color,borderColor:border,borderWidth:.6});}
 function pageStart(){
  page=pdf.addPage([612,792]);
  page.drawImage(logo,{x:36,y:716,width:144,height:43.8});
  draw('SUPPLIER MATERIAL PRICING REQUEST',36,86,16,bold);
  wrap(unitPriceNote,540).forEach((line,i)=>draw(line,36,109+12*i));
  draw('If not on hand, enter lead time and choose the day basis. Download to fill in electronically.',36,137);
  draw('Page '+pdf.getPageCount(),527,766,9);
  y=154;
  ['Material description','Internal Cat. #','Quantity','Unit','Unit price','On hand','Lead time','Day basis'].forEach((label,i)=>{
   box(cols[i],y,widths[i],24,head);draw(label,cols[i]+5,y+(i===4||i===6?3:7),8,bold);if(i===4)draw('(optional)',cols[i]+5,y+12,7);if(i===6)draw('(days)',cols[i]+5,y+12,7);
  });
  y+=24;
 }
 function field(name,x,top,w,h){
  const f=form.createTextField(name);
  f.addToPage(page,{x,y:792-top-h,width:w,height:h,borderColor:border,borderWidth:.7,backgroundColor:entry});
  f.setFontSize(9);
 }
 pageStart();
 rows.forEach(({description,part,unit,quantity},i)=>{
  const texts=[description,part,quantity,unit].map((s,n)=>wrap(s,widths[n]-10));
  const height=Math.max(29,Math.max(...texts.map(a=>a.length))*12+10);
  if(height>550)throw Error('A material description is too long for the PDF. Export CSV or shorten that description.');
  if(y+height>742)pageStart();
  widths.forEach((w,n)=>box(cols[n],y,w,height));
  texts.forEach((lines,n)=>lines.forEach((s,j)=>draw(s,cols[n]+5,y+7+12*j)));
  const row=i+1,top=y+5;
  field('Row '+row+' supplier unit price',cols[4]+5,top,widths[4]-10,19);
  form.createCheckBox('Row '+row+' on hand').addToPage(page,{x:cols[5]+16,y:792-top-15,width:12,height:12,borderColor:border,borderWidth:.8,backgroundColor:entry});
  field('Row '+row+' lead time days',cols[6]+5,top,widths[6]-10,19);
  const basis=form.createDropdown('Row '+row+' lead time basis');
  basis.addOptions([' ','Business days','Calendar days']);
  basis.select(' ');
  basis.addToPage(page,{x:cols[7]+4,y:792-top-19,width:widths[7]-8,height:19,borderColor:border,borderWidth:.7,backgroundColor:entry});
  basis.setFontSize(8);
  y+=height;
 });
 if(y+43>750){
  page=pdf.addPage([612,792]);
  draw('SUPPLIER MATERIAL PRICING REQUEST',36,35,16,bold);draw('Page '+pdf.getPageCount(),527,766,9);y=77;
 }
 draw('Supplier quote total',355,y+16,11,bold);
 field('Supplier quote total',464,y+11,112,23);
 return pdf.save();
}
