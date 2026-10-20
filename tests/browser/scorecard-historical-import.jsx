import React from 'react';
import {createRoot} from 'react-dom/client';
import {ScorecardHistoricalImport} from '../../src/modules/eos/ScorecardHistoricalImport.jsx';
import '../../src/modules/eos/scorecard.css';
let saved=null;let once=true;
const store={
 async all(){return {metrics:[],categories:[],definitions:[]};},
 async previewHistorical(rows,id){saved={import_id:id,status:'preview',success:0,ready:1,held:1,errors:0,expires_at:'synthetic fixture only',rows:rows.map((source,i)=>({row:i+1,source,value:i?null:0,status:i?'held':'ready',message:i?'Blank source; no observation created':'Insert new observation'}))};return saved;},
 async readHistorical(id){if(id!==saved?.import_id)throw new Error('Import not found for current actor');return saved;},
 async applyHistorical(id){if(id!==saved?.import_id)throw new Error('Import not found');saved={...saved,status:'applied',success:1,ready:0};if(once){once=false;throw new Error('Synthetic lost response after commit');}return saved;}
};
createRoot(document.getElementById('root')).render(<main className="scorecard-workspace"><h1>Synthetic historical import QA</h1><ScorecardHistoricalImport store={store}/></main>);
