import {createRequire} from 'node:module';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage();await page.addScriptTag({path:'node_modules/jsqr/dist/jsQR.js'});
 const image='data:image/png;base64,'+(await readFile('.temp/storage-workspace/labels-small.png')).toString('base64');
 const results=await page.evaluate(async data=>{
  const img=new Image();img.src=data;await img.decode();const all=[];
  for(let i=0;i<6;i++){const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1000;const ctx=canvas.getContext('2d');ctx.drawImage(img,(.15625+(i%2)*4.1875)*300,(.5+Math.floor(i/2)*10/3)*300,1200,1000,0,0,1200,1000);const pixels=ctx.getImageData(0,0,1200,1000);all.push(window.jsQR(pixels.data,1200,1000)?.data);}
  return all;
 },image);
 for(let i=0;i<6;i++)assert.equal(results[i],'https://rnsolutions.net/scan/location/00000000-0000-4000-8000-'+String(i).padStart(12,'0'));
 console.log('PASS: all six minimum-size QR codes decode from the rendered Avery PDF at 300 DPI to the exact stable location URLs.');
}finally{await browser.close();}
