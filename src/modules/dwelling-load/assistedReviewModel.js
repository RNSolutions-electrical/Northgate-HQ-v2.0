/** Read-only guided-review groundwork. Does not implement new demand rules or apply values. */
export function createAssistedReviewTools() {
  const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
  function assistedReviewContext(payload){
    const copy=structuredClone(payload);
    for(const key of ['assistedReview','updatedAt','lastBackup','lastImport'])delete copy[key];
    for(const row of copy.rows||[])if(row.calculationSource&&typeof row.calculationSource==='object')delete row.calculationSource.snapshot;
    return copy;
  }
  function assistedContextRevision(payload){return canonical(assistedReviewContext(payload));}
  const utf8Length=value=>encodeURIComponent(value).replace(/%[A-F\d]{2}|./g,'x').length;
  const sqlLikeJSON=value=>Array.isArray(value)?'['+value.map(sqlLikeJSON).join(', ')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+': '+sqlLikeJSON(value[key])).join(', ')+'}':JSON.stringify(value);
  function validateAssistedReview(payload){
    if(payload.assistedReview===undefined||payload.assistedReview===null)return payload;
    const a=payload.assistedReview,fail=()=>{throw Error('Invalid or oversized assisted review.');};
    const obj=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
    const text=(v,max)=>typeof v==='string'&&v.length<=max;
    const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
    const ids=(v,max)=>Array.isArray(v)&&v.length<=max&&v.every(uuid)&&new Set(v.map(id=>id.toLowerCase())).size===v.length;
    if(payload.schema!==2||!obj(a,['version','sourceContext','answers','systems','scenarios','proposal'])||a.version!==1||a.proposal!==null||!(a.sourceContext===null||a.sourceContext&&typeof a.sourceContext==='object'&&!Array.isArray(a.sourceContext)))fail();
    if(a.sourceContext!==null&&utf8Length(sqlLikeJSON(a.sourceContext))>524288)fail();
    const body={...a};delete body.sourceContext;
    if(utf8Length(sqlLikeJSON(body))>400000||utf8Length(sqlLikeJSON(payload))>2000000)fail();
    if(!Array.isArray(a.answers)||a.answers.length>100||!Array.isArray(a.systems)||a.systems.length>20||!Array.isArray(a.scenarios)||a.scenarios.length>20)fail();
    const answers=new Set(),systems=new Set(),scenarios=new Set();
    for(const answer of a.answers){
      if(!obj(answer,['questionId','text','sourceReferences'])||!text(answer.questionId,150)||!answer.questionId.trim()||answers.has(answer.questionId)||!text(answer.text,4000)||!Array.isArray(answer.sourceReferences)||answer.sourceReferences.length>10||answer.sourceReferences.some(v=>!text(v,1000)))fail();answers.add(answer.questionId);
    }
    for(const system of a.systems){
      if(!obj(system,['id','label','rowIds','zone','controller','heatSource','notes'])||!uuid(system.id)||systems.has(system.id.toLowerCase())||!text(system.label,200)||!ids(system.rowIds,500)||!text(system.notes,4000))fail();
      for(const key of ['zone','controller','heatSource'])if(!text(system[key],1000))fail();systems.add(system.id.toLowerCase());
    }
    for(const scenario of a.scenarios){
      if(!obj(scenario,['id','label','includedRowIds','excludedRowIds','systemIds','controlEvidence','ruleBasis','reviewClaim'])||!uuid(scenario.id)||scenarios.has(scenario.id.toLowerCase())||!text(scenario.label,200)||!ids(scenario.includedRowIds,500)||!ids(scenario.excludedRowIds,500)||!ids(scenario.systemIds,20)||!text(scenario.controlEvidence,4000)||!text(scenario.ruleBasis,4000)||!['unreviewed','user-reviewed'].includes(scenario.reviewClaim))fail();scenarios.add(scenario.id.toLowerCase());
    }
    return payload;
  }
  function invalidateAssistedReview(payload){const next=structuredClone(payload);if(next.assistedReview)next.assistedReview.sourceContext=null;return next;}
  function assistedReviewToDraft(payload){
    validateAssistedReview(payload);const a=payload.assistedReview;
    return a?{contextRevision:a.sourceContext===null?'':canonical(a.sourceContext),values:Object.fromEntries(a.answers.map(answer=>[answer.questionId,answer.text])),scenarios:a.scenarios.map(s=>({id:s.id,label:s.label,rowIds:[...s.includedRowIds],excludedRowIds:[...s.excludedRowIds],controlEvidence:s.controlEvidence,verification:s.reviewClaim==='user-reviewed'?'reviewed':'unverified'}))}:{contextRevision:'',values:{},scenarios:[]};
  }
  const finite=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
  const string=value=>typeof value==='string'?value:'';
  function validateDraft(draft){
    const issues=[];
    const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
    if(!object(draft))return ['Draft answers must be an object.'];
    if(Object.keys(draft).some(k=>!['contextRevision','values','scenarios'].includes(k)))issues.push('Unknown draft answer property.');
    if(draft.contextRevision!==undefined&&(typeof draft.contextRevision!=='string'||draft.contextRevision.length>2000000))issues.push('Invalid draft input revision.');
    if(draft.values!==undefined){if(!object(draft.values)||Object.keys(draft.values).length>100)issues.push('Invalid draft answer map.');else for(const [key,value]of Object.entries(draft.values))if(key.length>150||typeof value!=='string'||value.length>4000)issues.push('Draft answers must be bounded text.');}
    if(draft.scenarios!==undefined){
      if(!Array.isArray(draft.scenarios)||draft.scenarios.length>20)issues.push('Invalid draft scenario list.');
      else for(const scenario of draft.scenarios){
        if(!object(scenario)||Object.keys(scenario).length!==6||!['id','label','rowIds','excludedRowIds','controlEvidence','verification'].every(k=>Object.hasOwn(scenario,k))){issues.push('Invalid draft scenario properties.');continue;}
        for(const [key,limit] of [['id',100],['label',200],['controlEvidence',4000]])if(typeof scenario[key]!=='string'||scenario[key].length>limit)issues.push('Invalid scenario text.');
        for(const key of ['rowIds','excludedRowIds'])if(!Array.isArray(scenario[key])||scenario[key].length>500||scenario[key].some(id=>typeof id!=='string'||id.length>100))issues.push('Invalid scenario component references.');
        if(!['unverified','reviewed'].includes(scenario.verification))issues.push('Invalid draft verification label.');
      }
    }
    return [...new Set(issues)];
  }
  function planAssistedReview(payload,engineResult,draftAnswers={}){
    const p=payload||{},engine=engineResult||{},rows=Array.isArray(p.rows)?p.rows:[],contextRevision=assistedContextRevision(p);
    const draftIssues=validateDraft(draftAnswers);
    const hasDraft=draftAnswers&&typeof draftAnswers==='object'&&!draftIssues.length;
    const current=Boolean(hasDraft&&draftAnswers.contextRevision===contextRevision);
    const values=current&&draftAnswers.values&&typeof draftAnswers.values==='object'?draftAnswers.values:{};
    const questions=[];
    const add=(id,section,label,reason)=>{
      const raw=values[id],value=typeof raw==='string'&&raw.length<=4000?raw:'';
      questions.push({id,section,label,kind:'text',required:true,value,answered:Boolean(value.trim()),verification:'unverified',reason});
    };
    add('scope.occupancy','Applicability','What is the occupancy and residential-code scope of the complete study?','One-family, multifamily, accessory, mixed-use and partial-feeder cases are not interchangeable.');
    add('scope.ahj','Applicability','Which AHJ, adopted edition/amendments, and applicability confirmation support this study?','Code edition text and an old confirmation checkbox do not verify the applicable rules.');
    add('scope.system','Applicability','What verified voltage, phase, conductor arrangement and service/feeder boundaries apply?','The current engine is restricted to its documented 120/240 V dwelling scope.');
    add('scope.work','Applicability','Is this an entire dwelling assessment, an addition to an existing load, or a partial feeder? What is existing versus proposed?','Do not substitute optional whole-dwelling treatment for another calculation path.');
    add('inventory.complete','Inventory','How was the complete inventory verified, including missing or unknown nameplates and omitted loads?','Unlisted equipment is not zero load.');
    add('inventory.continuous','Inventory','Which continuous, EV, pool/spa, special or other loads need separate treatment, and what supports that treatment?','An additional reviewed-load row is not an automatic rule selector.');
    add('inventory.overlap','Inventory','Which ratings include other components, and how did you prevent duplicate equipment or quantities?','Do not add component ratings to a packaged nameplate that already includes them.');
    add('optional.entire','Optional method','Does the optional method cover the entire qualifying dwelling load? State the eligibility basis or why it is inapplicable.','The existing optionalEligible checkbox is not a new guided eligibility determination.');
    add('optional.supply','Optional method','What independently verified supply arrangement and ampacity establish optional-method eligibility?','Existing equipment rating alone does not verify all method requirements.');
    add('motors.inventory','Motors','Which standalone and embedded motors must be considered, including their source and applicable load basis?','A standalone motor list cannot establish the largest applicable motor when embedded motors are unknown.');
    add('motors.allowance','Motors','Which motor contribution is already included in HVAC or other reviewed values? Explain the largest-motor selection and duplicate-adder prevention.','The engine applies the entered standard-method motor adder; it does not independently verify its applicability.');
    const hvac=rows.filter(r=>r.cat==='hvac'),cooking=rows.filter(r=>r.cat==='cooking'),dryers=rows.filter(r=>r.cat==='dryer');
    if(rows.some(r=>r.cat==='fixed'))add('fixed.eligibility','Fixed appliances','Which listed fixed appliances qualify for the demand factor, and how were cooking, dryers and HVAC excluded?','Category labels alone do not establish appliance eligibility.');
    if(dryers.length)add('dryer.classification','Dryers','Are these household electric dryers, and are count and individual ratings verified? Explain any manual demand override.','The standard and optional methods use different dryer inputs; do not copy the standard minimum into the optional pool.');
    if(cooking.length){
      add('cooking.classification','Cooking','Classify every cooking appliance: household or other use, range/cooktop/oven/warming/other, installation and purpose.','Mixed or unusual cooking equipment is not automatically eligible for one demand table.');
      add('cooking.ratings','Cooking','What individual ratings and appliance relationships support the calculation? Identify any combined-nameplate or shared assembly.','Do not assume multiple appliances form one range or double-count a combination rating.');
      add('cooking.rules','Cooking','Which adopted table, column and notes support the standard cooking demand? Record the reviewed arithmetic or unresolved question.','No new cooking-table demand formula is implemented in this guided candidate.');
    }
    if(hvac.length){
      add('hvac.roles','HVAC systems','Map each AHU, CU, compressor, fan, boiler electrical load and other component to its actual system and role.','FLA, RLA, package totals and component ratings must not be summed without resolving overlap.');
      add('hvac.zones','HVAC systems','Where is each system located, which zones does it serve, and which thermostats/controllers govern it?','Different zones may operate heating and cooling at the same time.');
      add('hvac.heat-source','HVAC systems','What provides heat for each system: combustion boiler, heat pump, resistance heat or another source? Identify electrical auxiliaries separately.','Boiler thermal output is not its electrical input. No heat source is guessed from a label.');
      add('hvac.strips','HVAC systems','Are electric strip heaters present now? Separately describe proposed strips, their ratings, controls and configuration.','Hypothetical additions belong in a separate proposed scenario, not the existing inventory.');
      add('hvac.modes','HVAC operating scenarios','List normal, auxiliary/emergency, defrost and other applicable operating combinations, including operation across independent systems.','A whole-house max(heat,cool) shortcut is not assumed.');
      add('hvac.controls','HVAC operating scenarios','What controls or interlocks prevent specific combinations? Cite wiring/control documentation, manufacturer evidence, testing and remaining uncertainty.','Intent, seasonal habit or an unchecked assertion does not establish code-permitted noncoincidence.');
      add('hvac.noncoincidence','HVAC operating scenarios','For each excluded simultaneous combination, what verified facts and applicable rule justify the exclusion?','A user-entered reviewed label is not independent verification or an automatic noncoincidence allowance.');
      add('hvac.method-rule','HVAC method treatment','Explain standard and optional HVAC treatment separately, including heat-pump/supplemental-heat interaction and motor allowance.','No new HVAC demand rule, optional heating percentage or automatic motor adder is derived here.');
    }
    const blockers=questions.filter(q=>!q.answered).map(q=>({id:q.id,reason:q.reason}));
    for(let i=0;i<draftIssues.length;i++)blockers.push({id:'draft.invalid.'+i,reason:draftIssues[i]});
    const scenarios=[],issues=[];
    const rawScenarios=current?draftAnswers.scenarios:undefined;
    if(rawScenarios!==undefined&&!Array.isArray(rawScenarios))issues.push('Operating scenarios must be an array.');
    const candidateScenarios=Array.isArray(rawScenarios)?rawScenarios:[];
    if(candidateScenarios.length>20)issues.push('At most 20 draft operating scenarios are supported.');
    const hvacIds=new Set(hvac.map(r=>r.id)),seenScenarioIds=new Set();
    for(const raw of candidateScenarios.slice(0,20)){
      if(!raw||typeof raw!=='object'||typeof raw.id!=='string'||!raw.id.trim()||raw.id.length>100||seenScenarioIds.has(raw.id)){issues.push('Scenario identities must be unique nonempty bounded strings.');continue;}
      seenScenarioIds.add(raw.id);
      const rowIds=Array.isArray(raw.rowIds)?raw.rowIds:[],excludedRowIds=Array.isArray(raw.excludedRowIds)?raw.excludedRowIds:[];
      const scenarioIssues=[];
      if(!Array.isArray(raw.rowIds)||!Array.isArray(raw.excludedRowIds)||rowIds.length>500||excludedRowIds.length>500)scenarioIssues.push('Explicit bounded included/excluded component lists are required.');
      if(!string(raw.label).trim()||string(raw.label).length>200)scenarioIssues.push('A bounded scenario label is required.');
      if(typeof raw.controlEvidence!=='string'||raw.controlEvidence.length>4000||!raw.controlEvidence.trim())scenarioIssues.push('Control/evidence rationale is missing or too large.');
      const assigned=[...rowIds,...excludedRowIds];
      if(assigned.some(id=>typeof id!=='string'||!hvacIds.has(id)))scenarioIssues.push('Scenario contains an unknown or non-HVAC component.');
      if(new Set(assigned).size!==assigned.length)scenarioIssues.push('A component appears more than once or is both included and excluded.');
      if([...hvacIds].some(id=>!assigned.includes(id)))scenarioIssues.push('Every HVAC component must be explicitly included or excluded.');
      if(!['unverified','reviewed'].includes(raw.verification))scenarioIssues.push('Unsupported draft verification label.');
      // Never upgrade claimed review to verified code applicability or arithmetic.
      scenarioIssues.push('Operating exclusions and method-specific demand treatment still need independent professional/code review.');
      const item={id:raw.id,label:string(raw.label).slice(0,200),rowIds:rowIds.slice(0,500),excludedRowIds:excludedRowIds.slice(0,500),controlEvidence:string(raw.controlEvidence).slice(0,4000),verification:'unverified',claimedVerification:raw.verification==='reviewed'?'reviewed':'unverified',issues:scenarioIssues};
      scenarios.push(item);issues.push(...scenarioIssues.map(reason=>`${item.label||item.id}: ${reason}`));
    }
    if(hvac.length&&!scenarios.length)issues.push('No explicit HVAC operating scenarios have been recorded.');
    for(let i=0;i<issues.length;i++)blockers.push({id:'scenario.'+i,reason:issues[i]});
    blockers.push({id:'review.required',reason:'Draft answers are user-entered and unverified. Guided questions do not establish code applicability or independently verify source data.'});
    if(hvac.length)blockers.push({id:'rules.hvac',reason:'New HVAC/noncoincidence demand-rule automation is not implemented or verified in this candidate.'});
    if(cooking.length)blockers.push({id:'rules.cooking',reason:'New cooking-table and note automation is not implemented or verified in this candidate.'});
    const line=(label,key,origin,rule,reason)=>({label,value:finite(engine[key]),origin,rule,reason});
    const sections=[{id:'standard',title:'Current standard-method calculation audit',lines:[
      line('General connected load','generalConnected','automatic','Current engine: 220.12 / 220.52','Floor area and circuit inputs; not independently verified.'),
      line('General demand','generalDemand','automatic','Current engine: Table 220.42','Existing standard demand tiers.'),
      line('Fixed-appliance demand','fixedDemand','automatic','Current engine: 220.53','Uses category/count supplied by the user; qualification still needs review.'),
      line('Dryer demand','dryerDemand',dryers.reduce((n,r)=>n+(Number(r.qty)||0),0)>4?'manual-reviewed-input':'automatic','Current engine: 220.54','One to four dryers use the existing minimum/nameplate rule; more than four uses the supplied override.'),
      line('Cooking demand','cooking','manual-reviewed-input','User-supplied standard cooking demand','Not automatically derived by the guided planner.'),
      line('Standalone motor base','motors','automatic','Current engine motor inventory','Sums itemized rows; embedded/duplicate motor treatment remains unresolved.'),
      line('Largest-motor adder','motorAdder','automatic','Current engine: 25% of user-entered largest applicable motor VA','Arithmetic is automatic; the motor basis and prior allowances are user-reviewed inputs.'),
      line('HVAC applied demand','hvacStandard','manual-reviewed-input','User-supplied standard HVAC demand','No guided scenario demand was substituted.'),
      line('Other reviewed loads','other','manual-reviewed-input','Already-reviewed loads supplied by user','Carried at the existing engine treatment, not independently classified.')
    ]},{id:'optional',title:'Current optional-method calculation audit',lines:[
      line('Optional general/nameplate pool','optionalBase','automatic','Current engine: 220.82(B)','Includes cooking and dryer nameplates, not standard cooking demand or standard dryer minimum.'),
      line('Optional general demand','optionalGeneral','automatic','Current engine: first 10,000 VA then 40% remainder','Eligibility and appliance classifications remain user-reviewed.'),
      line('Optional HVAC applied demand','hvacOptional','manual-reviewed-input','User-supplied optional HVAC demand','Not inferred from standard HVAC or guided answers.'),
      line('Other reviewed loads','other','manual-reviewed-input','Existing additional-load treatment','Outside the optional demand pool; not an automatic applicability decision.')
    ]}];
    const validNumber=(value,{positive=false,integer=false,min=0}={})=>typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value))&&(positive?Number(value)>0:Number(value)>=min)&&(!integer||Number.isInteger(Number(value)));
    const unknown=(sectionId,label,reason)=>{
      const item=sections.find(section=>section.id===sectionId).lines.find(item=>item.label===label);
      if(item){item.value=null;item.reason='Unknown: '+reason+' The engine placeholder or partial subtotal is not a verified input.';}
    };
    const missingOverride=(sectionId,label,raw,basis)=>{
      if(validNumber(raw)&&(basis===undefined||typeof basis==='string'&&basis.trim()))return;
      unknown(sectionId,label,'A required nonnegative reviewed value or rationale has not been supplied.');
    };
    if(cooking.length)missingOverride('standard','Cooking demand',p.cookingDemand,p.cookingNote);
    if(hvac.length){missingOverride('standard','HVAC applied demand',p.hvacStandard,p.hvacNote);missingOverride('optional','Optional HVAC applied demand',p.hvacOptional,p.hvacNote);}
    missingOverride('standard','Largest-motor adder',p.largestMotor);
    if(dryers.reduce((n,r)=>n+(Number(r.qty)||0),0)>4)missingOverride('standard','Dryer demand',p.dryerDemand,p.dryerNote);
    const generalKnown=validNumber(p.area,{positive:true})&&validNumber(p.small,{integer:true,min:2})&&validNumber(p.laundry,{integer:true,min:1});
    const categoryKnown=category=>rows.filter(row=>row.cat===category).every(row=>validNumber(row.qty,{positive:true,integer:true})&&validNumber(row.va,{positive:true}));
    if(!generalKnown){unknown('standard','General connected load','Floor area or required circuit counts are missing or invalid.');unknown('standard','General demand','General-load source inputs are incomplete.');}
    for(const [category,label]of [['fixed','Fixed-appliance demand'],['motor','Standalone motor base'],['dryer','Dryer demand'],['other','Other reviewed loads']])if(!categoryKnown(category))unknown('standard',label,'An equipment quantity or per-unit VA is missing or invalid.');
    if(!categoryKnown('motor'))unknown('standard','Largest-motor adder','Itemized motor inputs are incomplete, so the supplied motor selection cannot be reconciled.');
    if(!categoryKnown('other'))unknown('optional','Other reviewed loads','An additional-load quantity or per-unit VA is missing or invalid.');
    if(!generalKnown||!['fixed','cooking','dryer','motor'].every(categoryKnown)){
      unknown('optional','Optional general/nameplate pool','One or more general-load or applicable equipment inputs are incomplete.');
      unknown('optional','Optional general demand','The optional demand pool has incomplete source inputs.');
    }
    const method=key=>{
      const errors=Array.isArray(engine[key+'Errors'])?engine[key+'Errors'].map(String):['Current engine result is unavailable.'];
      const value=finite(engine[key]),amps=finite(engine[key+'Amps']);
      const auditIncomplete=sections.find(section=>section.id===key).lines.some(item=>item.value===null);
      return {value,amps,engineErrors:errors,auditIncomplete,engineStatus:value===null||amps===null?'incomplete':errors.length||auditIncomplete?'working-subtotal':'current-engine-checks-passed'};
    };
    return {contextRevision,inputSnapshot:contextRevision,status:'pending-review',questions,sections,methods:{standard:method('standard'),optional:method('optional')},blockers,scenarioReview:{scenarios,issues},proposedChanges:[],answersComplete:questions.every(q=>q.answered),draftContextCurrent:current,limitations:[
      'Read-only groundwork: no new cooking/HVAC demand formulas and no automatic application.',
      'Current calculator status and guided-review status are separate; supplied overrides remain manual.',
      'Answers are ephemeral UI drafts, not saved worksheet facts or independently verified evidence.',
      'No recommendation to choose the smaller method, no service adequacy verdict, and no conductor or generator sizing.',
      'The Clark County worksheet is an educational reference with local provisions, not normative North Carolina authority.'
    ]};
  }
  function assistedFactDefinitions(payload){
    const rows=payload.rows||[],facts=[];
    const add=(id,label,options)=>facts.push({id,label,options:[{value:'unknown',label:'Unknown / not yet reviewed'},...options.map(value=>({value,label:value.replaceAll('-',' ')}))],requiresSource:true});
    add('supported.guided.code-rule-set','Applicable code basis and AHJ review',['nec2017-nc-confirmed']);
    add('supported.guided.scope','Calculation scope',['entire-one-family-dwelling-reviewed']);
    add('supported.guided.inventory','Complete inventory review',['complete-inventory-reviewed']);
    if(rows.some(r=>r.cat==='cooking')){
      add('supported.cooking.classification','Cooking classification',['single-household-range']);
      add('supported.cooking.rating-basis','Cooking nameplate rating applicability',['applicable-nameplate-va-reviewed']);
      add('supported.cooking.complete-set','Entire cooking inventory',['only-this-one-range-reviewed']);
      add('supported.cooking.table-exceptions','Relevant table exceptions/notes',['none-applicable-reviewed']);
    }
    if(rows.some(r=>r.cat==='hvac')){
      add('supported.optional.supply-scope','Optional method supply and whole-dwelling scope',['single-120-240v-three-wire-entire-dwelling']);
      add('supported.optional.supply-ampacity','Verified supply conductor ampacity',['at-least-100a-independently-verified']);
      add('supported.hvac.supported-type','Supported HVAC proposal classification',['ac-cooling-only']);
      add('supported.hvac.other-categories','Other applicable heating/cooling selections',['no-heatpump-electricheat-or-other-c-selection-reviewed']);
      add('supported.hvac.overlap','Cooling nameplate overlap/omission review',['complete-nonoverlapping-nameplate-ratings-reviewed']);
      add('supported.hvac.boiler-auxiliaries','Combustion-boiler electrical auxiliaries',['none-present-reviewed','accounted-outside-cooling-reviewed']);
      add('supported.hvac.complete-cooling-set','Cooling components considered',['all-cooling-components-included-no-exclusions']);
      for(const row of rows.filter(r=>r.cat==='hvac')){
        add('supported.hvac.role.'+row.id,'Cooling role: '+row.label,['complete-cooling-package','distinct-cooling-component']);
        add('supported.hvac.rating.'+row.id,'Applicable nameplate basis: '+row.label,['applicable-cooling-nameplate-reviewed']);
      }
      facts.push({id:'supported.hvac.boiler-auxiliary-row-ids',label:'If boiler auxiliaries are accounted elsewhere: comma-separated existing row IDs with classification/source rationale',kind:'text',requiresSource:true});
    }
    return facts;
  }
  function evaluateSupportedProposals(payload,inspectSource) {
    validateAssistedReview(payload);
    const p=payload,a=p.assistedReview,context=assistedReviewContext(p),proposals=[],blockers=[];
    const current=Boolean(a&&a.sourceContext!==null&&canonical(a.sourceContext)===canonical(context));
    const answers=new Map((a?.answers||[]).map(answer=>[answer.questionId,answer]));
    const rows=Array.isArray(p.rows)?p.rows:[];
    const requireFact=(id,allowed,issues)=>{
      const answer=answers.get(id);
      if(!answer||!allowed.includes(answer.text)||!answer.sourceReferences.some(ref=>ref.trim())){issues.push({id,reason:'Explicit supported choice and source reference required: '+id});return false;}return true;
    };
    const common=()=>{
      const issues=[];
      if(!current)issues.push({id:'context',reason:'Saved guided source context is missing or stale; review/rebind current source facts first.'});
      requireFact('supported.guided.code-rule-set',['nec2017-nc-confirmed'],issues);
      requireFact('supported.guided.scope',['entire-one-family-dwelling-reviewed'],issues);
      requireFact('supported.guided.inventory',['complete-inventory-reviewed'],issues);
      if(p.voltage!=='240')issues.push({id:'voltage',reason:'Only the existing 120/240 V worksheet scope is supported.'});
      return issues;
    };
    const rating=row=>{
      if(typeof row.id!=='string'||!row.id||typeof row.va!=='string'||typeof row.qty!=='string'||!/^\d+(?:\.\d+)?$/.test(row.va.trim())||!/^\d+$/.test(row.qty.trim())||!(Number(row.va)>0)||!Number.isFinite(Number(row.va))||Number(row.va)>Number.MAX_SAFE_INTEGER||!Number.isSafeInteger(Number(row.qty))||Number(row.qty)<=0)return false;
      const [whole,fraction='']=row.va.trim().split('.');
      if(BigInt(whole)>BigInt(Number.MAX_SAFE_INTEGER)||(BigInt(whole)===BigInt(Number.MAX_SAFE_INTEGER)&&/[1-9]/.test(fraction)))return false;
      return true;
    };
    const sourceCurrent=(row,issues)=>{
      if(row.calculationSource!==undefined&&row.calculationSource!==null){
        let result;try{result=typeof inspectSource==='function'?inspectSource(row):null;}catch{result=null;}
        if(!result||result.status!=='current'||result.blocksConfidence!==false)issues.push({id:'source.'+row.id,reason:'Selected nameplate calculation source is stale or could not be independently checked by the source helper.'});
      }
    };
    const proposal=(id,method,target,value,ruleId,sourceIds,reasons)=>({id,method,target,before:p[target]??'',proposed:value,ruleId,ruleVersion:'2017-nec-nc-supported-v1',sourceIds,inputContext:structuredClone(context),reasons,sourceReferences:[...new Set((a?.answers||[]).flatMap(answer=>answer.sourceReferences).filter(ref=>ref.trim()))],limitations:['Conditional proposal based on user-attested facts, not independent field/AHJ verification.','No automatic application, service adequacy determination, or smaller-method recommendation.']});
    const cooking=rows.filter(row=>row.cat==='cooking');
    if(cooking.length){
      const issues=common();
      requireFact('supported.cooking.classification',['single-household-range'],issues);
      requireFact('supported.cooking.rating-basis',['applicable-nameplate-va-reviewed'],issues);
      requireFact('supported.cooking.complete-set',['only-this-one-range-reviewed'],issues);
      requireFact('supported.cooking.table-exceptions',['none-applicable-reviewed'],issues);
      const row=cooking[0];
      const cookingBand=()=>{if(!rating(row))return false;const [whole,fraction='']=row.va.trim().split('.');const n=BigInt(whole),remainder=/[1-9]/.test(fraction);return (n>8750n||n===8750n&&remainder)&&(n<12000n||n===12000n&&!remainder);};
      if(cooking.length!==1||!rating(row)||Number(row.qty)!==1||!cookingBand())issues.push({id:'supported.cooking.bounds',reason:'Supported case is exactly one household range, quantity one, above 8.75 kW and no greater than 12 kW. Other equipment/table-note cases remain unresolved.'});
      for(const item of cooking)sourceCurrent(item,issues);
      if(!issues.length)proposals.push(proposal('supported.cooking.single-range-column-c','standard','cookingDemand','8000','NEC2017-220.55-Table-ColumnC-1',[row.id],['User explicitly classified the complete cooking inventory as one household range with applicable nameplate rating and no table exceptions.','2017 Table 220.55 Column C, one appliance, supports 8 kW demand in this narrow rating band.','Optional cooking nameplate pooling is unchanged; no branch-circuit grouping or Note 3 alternate method is inferred.']));
      else blockers.push(...issues.map(issue=>({...issue,method:'standard',ruleId:'NEC2017-220.55-Table-ColumnC-1'})));
    }
    const cooling=rows.filter(row=>row.cat==='hvac');
    if(cooling.length){
      const issues=common();
      requireFact('supported.optional.supply-scope',['single-120-240v-three-wire-entire-dwelling'],issues);
      requireFact('supported.optional.supply-ampacity',['at-least-100a-independently-verified'],issues);
      requireFact('supported.hvac.supported-type',['ac-cooling-only'],issues);
      requireFact('supported.hvac.other-categories',['no-heatpump-electricheat-or-other-c-selection-reviewed'],issues);
      requireFact('supported.hvac.overlap',['complete-nonoverlapping-nameplate-ratings-reviewed'],issues);
      requireFact('supported.hvac.boiler-auxiliaries',['none-present-reviewed','accounted-outside-cooling-reviewed'],issues);
      requireFact('supported.hvac.complete-cooling-set',['all-cooling-components-included-no-exclusions'],issues);
      for(const row of cooling){
        requireFact('supported.hvac.role.'+row.id,['complete-cooling-package','distinct-cooling-component'],issues);
        requireFact('supported.hvac.rating.'+row.id,['applicable-cooling-nameplate-reviewed'],issues);
        if(!rating(row))issues.push({id:'supported.hvac.rating-invalid.'+row.id,reason:'A cooling component has missing/invalid positive nameplate VA or whole quantity.'});
        sourceCurrent(row,issues);
      }
      // System membership is explicit and exhaustive; labels never classify loads.
      const assigned=(a?.systems||[]).flatMap(system=>system.rowIds);
      if(cooling.some(row=>assigned.filter(id=>id.toLowerCase()===row.id.toLowerCase()).length!==1))issues.push({id:'supported.hvac.system-membership',reason:'Every cooling row must belong to exactly one recorded system.'});
      const coolingIds=new Set(cooling.map(row=>row.id.toLowerCase()));
      for(const scenario of a?.scenarios||[]){
        const included=scenario.includedRowIds.map(id=>id.toLowerCase()),excluded=scenario.excludedRowIds.map(id=>id.toLowerCase());
        if(excluded.some(id=>coolingIds.has(id)))issues.push({id:'supported.hvac.scenario-exclusion.'+scenario.id,reason:'A recorded scenario excludes a cooling component; this conservative all-cooling proposal path does not infer noncoincidence.'});
        if(included.some(id=>excluded.includes(id))||[...included,...excluded].some(id=>!rows.some(row=>row.id.toLowerCase()===id))||scenario.systemIds.some(id=>!a.systems.some(system=>system.id.toLowerCase()===id.toLowerCase())))issues.push({id:'supported.hvac.scenario-unresolved.'+scenario.id,reason:'A saved operating scenario has contradictory or missing equipment/system references.'});
      }

      if(assigned.some(id=>!rows.some(row=>row.id.toLowerCase()===id.toLowerCase())))issues.push({id:'supported.hvac.system-unknown',reason:'A recorded system references missing equipment; resolve inventory before proposing demand.'});
      const auxiliaryRows=[];
      if(answers.get('supported.hvac.boiler-auxiliaries')?.text==='accounted-outside-cooling-reviewed'){
        const reference=answers.get('supported.hvac.boiler-auxiliary-row-ids');
        const ids=reference?reference.text.split(',').map(id=>id.trim()).filter(Boolean):[];
        for(const id of ids){
          const row=rows.find(item=>item.id.toLowerCase()===id.toLowerCase());
          if(row&&!coolingIds.has(row.id.toLowerCase())){auxiliaryRows.push(row);sourceCurrent(row,issues);}
        }
        if(!ids.length||new Set(ids.map(id=>id.toLowerCase())).size!==ids.length||!reference.sourceReferences.some(ref=>ref.trim())||ids.some(id=>coolingIds.has(id.toLowerCase())||!rows.some(row=>row.id.toLowerCase()===id.toLowerCase()&&['fixed','motor','other'].includes(row.cat)&&rating(row))))issues.push({id:'supported.hvac.boiler-auxiliary-row-ids',reason:'Explicit existing non-HVAC boiler auxiliary row IDs, reviewed classification and references are required; never assume boiler electrical load is zero.'});
      }
      if(!issues.length){
        let scale=0;for(const row of cooling)scale=Math.max(scale,(row.va.trim().split('.')[1]||'').length);
        let total=0n;for(const row of cooling){const [whole,fraction='']=row.va.trim().split('.');total+=BigInt(whole+fraction.padEnd(scale,'0'))*BigInt(row.qty.trim());}
        const digits=total.toString().padStart(scale+1,'0'),value=scale?(digits.slice(0,-scale)+'.'+digits.slice(-scale)).replace(/0+$/,'').replace(/\.$/,''):digits;
        if(!Number.isFinite(Number(value))||total>BigInt(Number.MAX_SAFE_INTEGER)*10n**BigInt(scale))issues.push({id:'supported.hvac.numeric-limit',reason:'Cooling sum exceeds supported numeric range.'});
        else proposals.push(proposal('optional.cooling-only','optional','hvacOptional',value,'NEC2017-220.82-C1',[...cooling,...auxiliaryRows].map(row=>row.id),['User supplied explicit entire-dwelling eligibility, complete AC/cooling-only classifications and sources for every component.','All cooling rows are included at 100% of their reviewed nameplate ratings with exact quantity arithmetic; no noncoincidence exclusion or motor adder is applied.','No heat pump, electric heating or other applicable heating selection is asserted; boiler auxiliaries, if present, are separately identified outside this sum. Source IDs include these auxiliary evidence rows, but their VA is not included in the cooling sum.']));
      }
      if(issues.length)blockers.push(...issues.map(issue=>({...issue,method:'optional',ruleId:'NEC2017-220.82-C1'})));
    }
    return {status:proposals.length?'conditional-proposals':'blocked-or-not-applicable',proposals,blockers};
  }
  return {assistedFactDefinitions,evaluateSupportedProposals,assistedReviewContext,validateAssistedReview,invalidateAssistedReview,assistedReviewToDraft,assistedContextRevision,planAssistedReview};
}
export const {assistedFactDefinitions,evaluateSupportedProposals,assistedReviewContext,validateAssistedReview,invalidateAssistedReview,assistedReviewToDraft,assistedContextRevision,planAssistedReview}=createAssistedReviewTools();
