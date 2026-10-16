import React,{useEffect,useRef,useState} from 'react';
import './pdfPreviewOverlay.css';

/** Preview the exact export bytes. No navigation, download or print occurs on open. */
export default function PdfPreviewOverlay({bytes,filename,title='PDF preview',onClose}){
 const dialog=useRef(null),pages=useRef(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[printing,setPrinting]=useState(false);
 const printFrame=useRef(null);
 const mounted=useRef(true);
 useEffect(()=>{
  const element=dialog.current,doc=element.ownerDocument,previous=doc.activeElement;
  mounted.current=true;element.showModal();
  return ()=>{mounted.current=false;printFrame.current?.remove();previous?.focus();};
 },[]);
 useEffect(()=>{
  let cancelled=false,loading,pdf;
  setReady(false);setError('');
  (async()=>{
   const [pdfjs,worker]=await Promise.all([import('pdfjs-dist'),import('pdfjs-dist/build/pdf.worker.mjs?url')]);
   if(cancelled)return;
   pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
   loading=pdfjs.getDocument({data:new Uint8Array(bytes)});pdf=await loading.promise;
   if(cancelled)return;
   pages.current.replaceChildren();
   for(let number=1;number<=pdf.numPages;number++){
    const page=await pdf.getPage(number);if(cancelled)return;
    const viewport=page.getViewport({scale:1.5}),canvas=pages.current.ownerDocument.createElement('canvas');
    canvas.width=viewport.width;canvas.height=viewport.height;canvas.setAttribute('aria-label',`PDF page ${number} of ${pdf.numPages}`);canvas.setAttribute('role','img');
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    if(cancelled)return;pages.current.append(canvas);
   }
   setReady(true);
  })().catch(error=>{if(!cancelled)setError('Unable to render PDF preview: '+error.message);});
  return ()=>{cancelled=true;loading?.destroy();};
 },[bytes]);
 function download(){
  const doc=dialog.current.ownerDocument,url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),link=doc.createElement('a');
  link.href=url;link.download=filename;doc.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 async function print(){
  setPrinting(true);setError('');
  try{
   printFrame.current?.remove();
   const doc=dialog.current.ownerDocument,frame=doc.createElement('iframe');
   frame.title='Print PDF';frame.className='pdf-print-frame';doc.body.append(frame);printFrame.current=frame;
   const target=frame.contentDocument,style=target.createElement('style');
   style.textContent='@page{size:letter;margin:0}body{margin:0}img{display:block;width:8.5in;height:11in;break-after:page;page-break-after:always}img:last-child{break-after:auto;page-break-after:auto}';target.head.append(style);
   await Promise.all([...pages.current.querySelectorAll('canvas')].map(canvas=>new Promise((resolve,reject)=>{const img=target.createElement('img');img.onload=resolve;img.onerror=reject;img.src=canvas.toDataURL('image/png');target.body.append(img);})));
   if(!mounted.current)return;
   frame.contentWindow.focus();frame.contentWindow.print();
  }catch{if(mounted.current)setError('Printing could not start. Save / Download the PDF and print it from your PDF viewer.');}
  finally{if(mounted.current)setPrinting(false);}
 }
 return <dialog className="pdf-preview-overlay" ref={dialog} aria-label={title} onCancel={e=>{e.preventDefault();onClose();}}>
  <header><h2>{title}</h2><div className="pdf-preview-actions"><button onClick={onClose}>Back to edit</button><button disabled={!ready||printing} onClick={print}>{printing?'Preparing print…':'Print'}</button><button disabled={!ready} onClick={download}>Save / Download</button><button aria-label="Close PDF preview" onClick={onClose}>Close</button></div></header>
  {!ready&&!error&&<p role="status">Rendering PDF preview…</p>}{error&&<p role="alert">{error}</p>}
  <div className="pdf-preview-pages" ref={pages}/>
 </dialog>;
}
