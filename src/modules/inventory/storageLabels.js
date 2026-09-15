import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {createQrModules} from '../../lib/qrCode.js';
import {buildLocationQrUrl} from '../../lib/locationQr.js';
// Avery 5164 / 94215: Letter, 4 x 3 1/3 in, 2 columns x 3 rows.
export const AVERY_5164=Object.freeze({width:612,height:792,labelWidth:288,labelHeight:240,left:11.25,top:36,pitchX:301.5,pitchY:240});
export function labelBounds(index){const slot=index%6;return {page:Math.floor(index/6),x:AVERY_5164.left+(slot%2)*AVERY_5164.pitchX,y:792-36-(Math.floor(slot/2)+1)*240,width:288,height:240};}
export async function createStorageLabels(records,{qrInches=1.75,startSlot=1,origin}={}){
 if(!records.length)throw new Error('Select at least one location.');
 if(!Number.isFinite(qrInches)||qrInches<0.75||qrInches>2.1)throw new Error('QR size must be between 0.75 and 2.1 inches.');
 if(!Number.isInteger(startSlot)||startSlot<1||startSlot>6)throw new Error('Starting label must be 1–6.');
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const pages=[];
 function text(page,value,x,y,width,size=10,face=font){
  const raw=String(value||'').replace(/[\r\n]+/g,' ');
  try{face.encodeText(raw);}catch{throw new Error('A location contains characters unsupported by the label font. Update the label text before exporting.');}
  let result=raw;
  while(result&&face.widthOfTextAtSize(result,size)>width)result=result.slice(0,-1);
  if(result!==raw){while(result&&face.widthOfTextAtSize(result+'...',size)>width)result=result.slice(0,-1);result+='...';}
  page.drawText(result,{x,y,size,font:face,color:rgb(.08,.1,.12)});
 }
 records.forEach((row,i)=>{
  const b=labelBounds(i+startSlot-1);while(pages.length<=b.page)pages.push(pdf.addPage([612,792]));
  const page=pages[b.page],x=b.x+12,w=264,top=b.y+240-17;
  text(page,'NORTHGATE HQ  /  '+row.typeLabel.toUpperCase(),x,top,w,9,bold);
  text(page,row.path,x,top-17,w,12,bold);text(page,row.label,x,top-32,w,11);
  const size=qrInches*72,matrix=createQrModules(buildLocationQrUrl(row.id,origin)),step=size/(matrix.length+8),qx=b.x+(288-size)/2,qy=b.y+29;
  page.drawRectangle({x:qx,y:qy,width:size,height:size,color:rgb(1,1,1)});
  matrix.forEach((line,y)=>line.forEach((dark,x)=>{if(dark)page.drawRectangle({x:qx+(x+4)*step,y:qy+size-(y+5)*step,width:step,height:step,color:rgb(0,0,0)});}));
  text(page,row.physical_location||row.materials_summary||'Scan to open this storage location',x,b.y+13,w,9);
 });
 pdf.setTitle('Northgate HQ - Avery 5164 storage labels');return pdf.save();
}
export function downloadStorageFile(name,bytes,type){const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
