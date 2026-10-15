import React from 'react';import {createRoot} from 'react-dom/client';
import {ScorecardWorkspace} from '../../src/modules/eos/ScorecardWorkspace.jsx';
import {createLocalScorecardStore} from '../../src/modules/eos/scorecardStore.js';
import {makePeriod} from '../../src/modules/eos/scorecardLogic.js';
const periods=['2026-10-05','2026-10-12'].map(makePeriod);const actor={id:'qa',active:true};const members=[{user_id:'qa',display_name:'QA member',is_active:true,is_member:true}];
const definitions=[{id:'d',metric_id:'m',name:'QA weekly count',context:'Separate weekly totals',category_id:'c',category_label:'QA',owner_id:'qa',owner_label:'QA member',unit:'count',goal:5,window:'period',carry:'none',aggregation:'sum',effective_from:'2026-10-05',revision:1}];
const store=createLocalScorecardStore({metrics:[{id:'m',revision:1,retired:false}],definitions,periods,categories:[{id:'c',name:'QA',revision:1}],members,observations:[],audit:[],requests:{}},actor);
createRoot(document.getElementById('root')).render(<ScorecardWorkspace store={store}/>);
