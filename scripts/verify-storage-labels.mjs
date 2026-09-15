import {mkdir,writeFile} from 'node:fs/promises';
import {createStorageLabels} from '../src/modules/inventory/storageLabels.js';
const records=Array.from({length:7},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),typeLabel:['Unit','Shelf','Bay','Bin'][i%4],path:'SHOP / S1 / A / '+(i+1),label:'Conduit fittings and connectors',physical_location:'North wall - aisle 2'}));
await mkdir('.temp/storage-workspace',{recursive:true});
for(const size of [.75,1.75,2.1])await writeFile('.temp/storage-workspace/labels-'+size+'.pdf',await createStorageLabels(records,{qrInches:size}));
console.log('Created label QA PDFs (minimum/default/maximum QR sizes, 7 labels / 2 pages).');
