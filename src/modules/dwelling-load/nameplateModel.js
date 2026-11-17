/** Self-contained factory: serialized into the worksheet iframe as well as used in Node.
 * Source text is reference data, never code and never automatic verification.
 */
export function createNameplateTools() {
  const limits={plates:20,fields:50,label:200,reference:1000,notes:4000,value:2000,unit:100,basis:4000,snapshot:1000000};
  const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  const sameId=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
  const text=(v,max)=>typeof v==='string'&&v.length<=max;
  const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
  const modes=['direct-va','direct-kva','reviewed'];
  function validateNameplateRow(row) {
    if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid equipment row.');
    if(row.nameplates!==undefined){
      if(!Array.isArray(row.nameplates)||row.nameplates.length>limits.plates)throw Error('At most 20 nameplate/reference records are supported per equipment row.');
      const plates=new Set();
      for(const plate of row.nameplates){
        if(!object(plate,['id','label','sourceReference','notes','fields'])||!uuid(plate.id)||plates.has(plate.id.toLowerCase())||!text(plate.label,limits.label)||!text(plate.sourceReference,limits.reference)||!text(plate.notes,limits.notes)||!Array.isArray(plate.fields)||plate.fields.length>limits.fields)throw Error('Invalid nameplate/reference record.');
        plates.add(plate.id.toLowerCase());const fields=new Set();
        for(const field of plate.fields){
          if(!object(field,['id','label','value','unit'])||!uuid(field.id)||fields.has(field.id.toLowerCase())||!text(field.label,limits.label)||!text(field.value,limits.value)||!text(field.unit,limits.unit))throw Error('Invalid nameplate/reference field.');
          fields.add(field.id.toLowerCase());
        }
      }
    }
    if(row.calculationSource!==undefined&&row.calculationSource!==null){
      const s=row.calculationSource;
      if(!uuid(row.id)||!object(s,['plateId','fieldId','mode','reviewedVA','basis','snapshot'])||!uuid(s.plateId)||!uuid(s.fieldId)||!modes.includes(s.mode)||!text(s.reviewedVA,limits.value)||!text(s.basis,limits.basis)||!text(s.snapshot,limits.snapshot))throw Error('Invalid calculation source.');
    }
    return row;
  }
  // Plain scalar only: no separators, sign, exponent, expression or range. The decimal
  // shift avoids IEEE754 multiplication artifacts; the existing engine still uses VA.
  function scalarVA(value,shift=0) {
    if(typeof value!=='string')throw Error('Enter a single nonnegative decimal value.');
    const raw=value.trim();
    if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw))throw Error('Only a single nonnegative decimal VA value is supported; ranges, units and formulas need review.');
    let [whole,fraction='']=raw.split('.');whole=whole||'0';
    const digits=whole+fraction+'0'.repeat(Math.max(0,shift-fraction.length));
    const point=whole.length+shift;
    let integer=digits.slice(0,point).replace(/^0+(?=\d)/,'')||'0';
    const decimal=digits.slice(point).replace(/0+$/,'');
    const result=integer+(decimal?'.'+decimal:'');
    const n=Number(result);
    if(!Number.isFinite(n)||BigInt(integer)>BigInt(Number.MAX_SAFE_INTEGER)||(BigInt(integer)===BigInt(Number.MAX_SAFE_INTEGER)&&decimal!=='')||(n===0&&/[1-9]/.test(result)))throw Error('Calculation value is outside the supported numeric range.');
    return result;
  }
  function selected(row,source) {
    const plate=row.nameplates?.find(p=>sameId(p.id,source.plateId));
    const field=plate?.fields.find(f=>sameId(f.id,source.fieldId));
    if(!plate||!field)throw Error('The selected source field no longer exists.');
    return {plate,field};
  }
  function resultVA(field,source) {
    if(source.mode==='reviewed'){
      if(!source.basis.trim())throw Error('Enter the calculation/review basis for the manually reviewed VA.');
      return scalarVA(source.reviewedVA);
    }
    const unit=field.unit.trim().toLowerCase();
    if((source.mode==='direct-va'&&unit!=='va')||(source.mode==='direct-kva'&&unit!=='kva'))throw Error('Direct selection requires the matching VA or kVA unit. W, A, ranges and other observations need a manually reviewed VA and basis.');
    if(source.reviewedVA!==''||source.basis!=='')throw Error('Direct sources must not retain manual reviewed values or basis.');
    return scalarVA(field.value,source.mode==='direct-kva'?3:0);
  }
  function snapshot(row,plate,field,s) {
    return JSON.stringify([row.id,row.cat,row.qty,row.label,row.nameplates.map(p=>[p.id,p.label,p.sourceReference,p.notes,p.fields.map(f=>[f.id,f.label,f.value,f.unit])]),plate.id,field.id,s.mode,s.reviewedVA,s.basis]);
  }
  function applyCalculationSource(row,choice) {
    validateNameplateRow(row);
    if(!uuid(row.id)||!choice||!uuid(choice.plateId)||!uuid(choice.fieldId)||!modes.includes(choice.mode))throw Error('Select an equipment source field and calculation mode.');
    const s={plateId:choice.plateId,fieldId:choice.fieldId,mode:choice.mode,reviewedVA:choice.reviewedVA??'',basis:choice.basis??'',snapshot:''};
    if(!text(s.reviewedVA,limits.value)||!text(s.basis,limits.basis))throw Error('Invalid reviewed calculation value or basis.');
    const {plate,field}=selected(row,s);
    s.plateId=plate.id;s.fieldId=field.id;
    const va=resultVA(field,s);s.snapshot=snapshot(row,plate,field,s);
    if(s.snapshot.length>limits.snapshot)throw Error('The complete equipment source context exceeds the 1 MB selection snapshot limit. Keep the original references and reduce this working record set before selecting; no source data was changed.');
    const next=structuredClone(row);next.va=va;next.calculationSource=s;
    validateNameplateRow(next);return next;
  }
  function inspectCalculationSource(row) {
    try {
      validateNameplateRow(row);
      if(row.calculationSource===undefined||row.calculationSource===null)return {status:'unselected',expectedVA:null,issues:[],blocksConfidence:false};
      const s=row.calculationSource,{plate,field}=selected(row,s),expectedVA=resultVA(field,s),issues=[];
      if(s.snapshot!==snapshot(row,plate,field,s))issues.push('The selected source, reference or review inputs changed; explicitly reselect and review the calculation value.');
      // Exact decimal normalization allows equivalent formatting, not unrelated manual edits.
      let actualVA=null;try{actualVA=scalarVA(row.va);}catch{issues.push('The equipment calculation VA is not a supported scalar.');}
      if(actualVA!==null&&actualVA!==expectedVA)issues.push('Equipment VA differs from the selected calculation source.');
      return {status:issues.length?'stale':'current',expectedVA,issues,blocksConfidence:issues.length>0};
    } catch(e) {return {status:'stale',expectedVA:null,issues:[e.message],blocksConfidence:true};}
  }
  function clearCalculationSource(row) {
    const next=structuredClone(row);next.calculationSource=null;return next;
  }
  /** Call for source edits, application or explicit deselection; does not alter raw sources/VA. */
  function invalidateNameplateReviews(payload) {
    const next=structuredClone(payload);
    for(const k of ['basisConfirmed','inventoryConfirmed','motorConfirmed','optionalEligible','optionalReviewed'])next[k]=false;
    for(const s of next.feederStudies?.studies||[]){
      for(const k of Object.keys(s.reviews||{}))s.reviews[k]=false;
      s.reviewSnapshot='';s.reviewedAt='';s.reviewedLoadIds=[];
    }
    return next;
  }
  function inspectNameplateSources(payload) {
    const rows=(payload.rows||[]).map(row=>({id:row.id,label:row.label,...inspectCalculationSource(row)}));
    return {blocksConfidence:rows.some(row=>row.blocksConfidence),rows};
  }
  function calculationIssues(rows) {
    return (rows||[]).flatMap((row,index)=>{
      const result=inspectCalculationSource(row);
      return result.blocksConfidence ? [`Equipment ${index+1}${row.label?' ('+row.label+')':''}: stale or invalid selected calculation source. Reselect and review its value, or explicitly clear the source and review the manual VA.`] : [];
    });
  }
  function withNameplateIssues(result,rows) {
    const issues=calculationIssues(rows);
    return {...result,standardErrors:[...new Set([...(result.standardErrors||[]),...issues])],optionalErrors:[...new Set([...(result.optionalErrors||[]),...issues])]};
  }
  // Pure arithmetic preview only. Exact rational arithmetic determines upward whole-VA
  // rounding; the displayed unrounded number is an approximation, not the rounding basis.
  function previewApparentPower(row,options,kind) {
    validateNameplateRow(row);
    const o=options;
    if(kind==='HVAC'&&row.cat!=='hvac')throw Error('HVAC arithmetic is available only for an HVAC equipment row.');
    if(kind==='motor'&&o?.individualMotorConfirmed!==true)throw Error('Confirm these source fields describe one individual motor, not a package or branch-circuit total.');
    if(!o||!(kind==='motor'?['FLA','RLA','FLC','BCSC']:['FLA','RLA']).includes(o.currentBasis)||!['single-phase','balanced-three-phase'].includes(o.phase))throw Error('Explicit FLA or RLA basis and supported phase selection are required.');
    for(const k of ['current','voltage','phaseField'])if(!o[k]||!uuid(o[k].plateId)||!uuid(o[k].fieldId))throw Error('Select the current, voltage and phase source fields.');
    const current=selected(row,o.current),voltage=selected(row,o.voltage),phase=selected(row,o.phaseField);
    const label=current.field.label.trim().toLowerCase().replace(/[-_.]/g,' ').replace(/\s+/g,' ');
    const baseLabel=label.replace(/^(compressor|fan|blower|motor|unit) /,'');
    const allowed={FLA:['fla','full load amps','full load amperes','full load amperage'],RLA:['rla','rated load amps','rated load amperes','rated load amperage'],FLC:['flc','full load current'],BCSC:['bcsc','branch circuit selection current']}[o.currentBasis];
    if(!allowed.includes(baseLabel))throw Error('The selected current field label must explicitly match its recorded FLA or RLA basis. MCA, MOCP, LRA and breaker ratings are not substitutes.');
    if(!['a','amp','amps','ampere','amperes'].includes(current.field.unit.trim().toLowerCase())||!['v','volt','volts'].includes(voltage.field.unit.trim().toLowerCase()))throw Error('Select scalar current in A and voltage in V; no unit inference is performed.');
    if(!['','ph','phase','phases','φ','ϕ'].includes(phase.field.unit.trim().toLowerCase()))throw Error('The phase source must record a phase count, not another electrical quantity.');
    const amps=scalarVA(current.field.value),volts=scalarVA(voltage.field.value),phaseCount=scalarVA(phase.field.value);
    if(Number(amps)<=0||Number(volts)<=0)throw Error('Current and voltage must be positive scalar values.');
    const isThree=o.phase==='balanced-three-phase';
    if(phaseCount!==(isThree?'3':'1'))throw Error('The recorded phase count must be exactly 1 or 3 and match the explicit phase selection.');
    if(o.currentMeasurementBasis!==(isThree?'line-current':'load-current'))throw Error(isThree?'Three-phase arithmetic requires explicitly confirmed line current.':'Single-phase arithmetic requires the current of this load.');
    if(o.voltageBasis!==(isThree?'line-to-line':'across-load'))throw Error(isThree?'Three-phase arithmetic requires confirmed line-to-line voltage.':'Single-phase arithmetic requires the voltage across this load, not a guessed system voltage.');
    if(o.suitabilityConfirmed!==true)throw Error('Confirm that the recorded current and voltage are appropriate for this reviewed apparent-power estimate.');
    if(isThree&&o.balanceConfirmed!==true)throw Error('Balanced three-phase line-current applicability must be explicitly confirmed.');
    if(!text(o.reviewBasis,limits.basis)||!o.reviewBasis.trim())throw Error('A documented suitability and review basis is required.');
    const ratio=v=>{const [a,b='']=v.split('.');return [BigInt(a+b),10n**BigInt(b.length)];};
    const [an,ad]=ratio(amps),[vn,vd]=ratio(volts),n=an*vn,d=ad*vd;
    const sqrtFloor=value=>{if(value<2n)return value;let x=1n<<BigInt(Math.ceil(value.toString(2).length/2));let y=(x+value/x)>>1n;while(y<x){x=y;y=(x+value/x)>>1n;}return x;};
    let rounded;
    if(isThree){const square=3n*n*n,denominator=d*d;const floor=sqrtFloor(square/denominator);rounded=floor+(floor*floor*denominator<square?1n:0n);}
    else rounded=(n+d-1n)/d;
    if(rounded<=0n||rounded>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Calculated apparent power exceeds the supported whole-VA range.');
    const va=rounded.toString(),unroundedVA=Number(amps)*Number(volts)*(isThree?Math.sqrt(3):1);
    if(!Number.isFinite(unroundedVA)||unroundedVA===0)throw Error('Calculated apparent power is outside the supported numeric range.');
    const formula=isThree?`S = √3 × V_LL × I_line = √3 × ${volts} V × ${amps} A`:`S = V_load × I = ${volts} V × ${amps} A`;
    const rounding='Rounded upward to the next whole VA using exact decimal input arithmetic (and exact integer square-root comparison for three phase). No NEC demand or motor factor applied.';
    const ref=x=>JSON.stringify([x.plate.id,x.plate.label,x.plate.sourceReference,x.field.id,x.field.label,x.field.value,x.field.unit]);
    const warnings=['Apparent-power arithmetic only, not NEC HVAC demand, actual measured input power, service sizing, or conductor/breaker sizing.','FLA and RLA are distinct recorded ratings. Suitability is user-reviewed; this tool does not verify nameplate accuracy.','Do not automatically add this result to an HVAC override or add another motor contribution. Review simultaneous/noncoincident loads and duplicate inventory separately.'];
    if(kind==='motor')warnings.push('Arithmetic does not select the legally applicable 430/440 motor-current basis. Confirm that separately; package or breaker totals are not an individual motor rating.');
    if(o.currentBasis==='RLA')warnings.push('RLA is a compressor reference rating, not a guaranteed actual running current.');
    const basis=`Reviewed ${kind} arithmetic; current basis ${o.currentBasis}; phase ${phaseCount}; voltage basis ${o.voltageBasis}; current measurement basis ${o.currentMeasurementBasis}; per-unit input, quantity not multiplied; suitability confirmed; ${isThree?'balanced line-current applicability confirmed':'single-phase load confirmed'}. ${formula}; approximate unrounded ${unroundedVA.toPrecision(15)} VA; adopted ${va} VA. ${rounding}\nCurrent source ${ref(current)}\nVoltage source ${ref(voltage)}\nPhase source ${ref(phase)}\nReviewer basis: ${o.reviewBasis}`;
    if(basis.length>limits.basis)throw Error('The complete calculation trace exceeds the 4000-character review-basis limit. Shorten reference labels or the review note; no source data was changed.');
    return {va,unroundedVA,formula,basis,warnings,rounding,inputs:{amps,volts,phaseCount,currentBasis:o.currentBasis,voltageBasis:o.voltageBasis,currentMeasurementBasis:o.currentMeasurementBasis}};
  }
  function previewHvacApparentPower(row,options){return previewApparentPower(row,options,'HVAC');}
  function previewMotorApparentPower(row,options){return previewApparentPower(row,options,'motor');}
  function motorSourceRow(row,motor){if(row.id!==motor.rowId)throw Error('Motor source equipment does not match.');return {...structuredClone(row),id:motor.id,qty:motor.quantity,label:row.id+' / '+row.label+' / '+motor.label,va:motor.va,calculationSource:motor.ratingSource};}
  function applyMotorCalculationSource(row,motor,choice){const selectedRow=applyCalculationSource(motorSourceRow(row,motor),choice);const refs=[...(motor.sourceReferences||[])],reference=selected(row,choice).plate.sourceReference;if(reference.trim()&&!refs.includes(reference)&&refs.length<10)refs.push(reference);return {...structuredClone(motor),va:selectedRow.va,ratingSource:selectedRow.calculationSource,sourceReferences:refs};}
  function inspectMotorCalculationSource(row,motor){try{return inspectCalculationSource(motorSourceRow(row,motor));}catch{return {status:'stale',blocksConfidence:true,issues:['Motor source context is invalid.']};}}
  function applyMotorApparentPower(row,motor,options){const preview=previewMotorApparentPower(motorSourceRow(row,motor),options);return applyMotorCalculationSource(row,motor,{plateId:options.current.plateId,fieldId:options.current.fieldId,mode:'reviewed',reviewedVA:preview.va,basis:preview.basis});}
  function applyHvacApparentPower(row,options) {
    const preview=previewHvacApparentPower(row,options);
    return applyCalculationSource(row,{plateId:options.current.plateId,fieldId:options.current.fieldId,mode:'reviewed',reviewedVA:preview.va,basis:preview.basis});
  }
  return {motorSourceRow,previewMotorApparentPower,applyMotorApparentPower,applyMotorCalculationSource,inspectMotorCalculationSource,previewHvacApparentPower,applyHvacApparentPower,calculationIssues,withNameplateIssues,limits,validateNameplateRow,applyCalculationSource,inspectCalculationSource,clearCalculationSource,invalidateNameplateReviews,inspectNameplateSources};
}
export const {motorSourceRow,previewMotorApparentPower,applyMotorApparentPower,applyMotorCalculationSource,inspectMotorCalculationSource,previewHvacApparentPower,applyHvacApparentPower,calculationIssues,withNameplateIssues,validateNameplateRow,applyCalculationSource,inspectCalculationSource,clearCalculationSource,invalidateNameplateReviews,inspectNameplateSources}=createNameplateTools();
