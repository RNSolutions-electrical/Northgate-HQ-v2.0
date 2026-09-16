// Point-to-point scalar method. Reference: Eaton Electrical Formulas, 2014,
// pp. 237–242. C presets: 600 V, three single conductors, steel/nonmagnetic.
export const sizes=['14','12','10','8','6','4','3','2','1','1/0','2/0','3/0','4/0','250','300','350','400','500','600','750','1000'];
const cuS=[389,617,981,1557,2425,3806,4774,5907,7293,8925,10755,12844,15082,16483,18177,19704,20566,22185,22965,24137,25278];
const cuN=[389,617,982,1559,2430,3826,4811,6044,7493,9317,11424,13923,16673,18594,20868,22737,24297,26706,28033,29735,31491];
const alS=[237,376,599,951,1481,2346,2952,3713,4645,5777,7187,8826,10741,12122,13910,15484,16671,18756,20093,21766,23478];
const alN=[237,376,599,952,1482,2350,2961,3730,4678,5838,7301,9110,11174,12862,14923,16813,18506,21391,23451,25976,28779];
export function cValue(s){return s.mode==='custom'?Number(s.c):({Cu:{steel:cuS,pvc:cuN},Al:{steel:alS,pvc:alN}}[s.material]?.[s.raceway]?.[sizes.indexOf(s.size)]);}
export function feeder(i,v,phase,length,c,sets){return i/(1+(phase===3?Math.sqrt(3):2)*length*i/(c*sets*v));}
export function transformer(kva,v,phase,z,tolerance=0){return kva*1000/((phase===3?Math.sqrt(3):1)*v)/(z*(1-tolerance/100)/100);}
export function descendants(nodes,id){let found=new Set([id]);for(let k=0;k<nodes.length;k++)for(const n of nodes)if(found.has(n.parent))found.add(n.id);return found;}
const valid=x=>['string','number'].includes(typeof x)&&String(x).trim()!==''&&Number.isFinite(Number(x));
const positive=x=>valid(x)&&Number(x)>0;
export function calculate(study){
 const out=Object.create(null),visiting=new Set(),nodes=study.nodes;
 const ids=nodes.map(n=>n.id);if(new Set(ids).size!==ids.length)throw Error('Duplicate equipment IDs.');
 if(nodes.filter(n=>n.kind==='source').length!==1)throw Error('Exactly one utility source is required.');
 function run(n){if(out[n.id])return out[n.id];if(visiting.has(n.id))throw Error('A connection loops back on itself.');visiting.add(n.id);
  try{
   if(!n.name?.trim()||!n.fault?.trim())throw Error('Enter equipment and fault names.');
   if(n.rating!==null&&n.rating!==undefined&&n.rating!==''&&!positive(n.rating))throw Error('Enter a positive equipment rating or leave it blank.');
   if(n.kind==='source'){
    if(n.parent)throw Error('Source cannot have an upstream connection.');
    if(!positive(n.voltage)||n.voltage<1||n.voltage>600||![1,3].includes(n.phase))throw Error('Use 1 or 3 phase and a voltage from 1–600 V.');
    if(n.method==='known'&&!positive(n.known))throw Error('Enter available source current in amperes.');
    if(n.method!=='known'&&(!positive(n.kva)||!positive(n.z)||!valid(n.tolerance)||n.tolerance<0||n.tolerance>=100))throw Error('Enter valid kVA, impedance and tolerance.');
    out[n.id]={i:n.method==='known'?+n.known:transformer(+n.kva,+n.voltage,n.phase,+n.z,+n.tolerance),v:+n.voltage,phase:n.phase,steps:[]};
   }else{
    const p=nodes.find(x=>x.id===n.parent);if(!p)throw Error('Select an upstream equipment item.');const upstream=run(p);if(upstream.error)throw Error('Upstream input needs attention.');
    let i=upstream.i;const steps=[];if(!n.segments?.length)throw Error('Add an incoming conductor segment.');
    for(const s of n.segments){let c=cValue(s);if(!valid(s.length)||s.length<0||!positive(c)||!Number.isInteger(+s.sets)||s.sets<1)throw Error('Check segment length, C value and parallel sets.');const next=feeder(i,upstream.v,upstream.phase,+s.length,c,+s.sets);steps.push({input:i,output:next,c,length:+s.length,sets:+s.sets});i=next;}
    let v=upstream.v;if(n.kind==='transformer'){
     if(!positive(n.voltage)||n.voltage<1||n.voltage>600||!positive(n.kva)||!positive(n.z)||n.tolerance<0||n.tolerance>=100||!Number.isFinite(+n.tolerance))throw Error('Enter valid transformer secondary data.');
     const f=i*upstream.v*(upstream.phase===3?Math.sqrt(3):1)*(n.z*(1-n.tolerance/100))/(100000*n.kva);i=upstream.v/n.voltage*i/(1+f);v=+n.voltage;
    }
    out[n.id]={i,v,phase:upstream.phase,steps,upstream:upstream.i};
   }
   if(!positive(out[n.id].i))throw Error('Calculation is outside the supported numeric range.');
  }catch(e){out[n.id]={error:e.message};}finally{visiting.delete(n.id);}return out[n.id];
 }for(const n of nodes)run(n);return out;
}
export const segment=()=>({length:50,size:'4/0',material:'Cu',raceway:'steel',sets:1,mode:'table',c:15082,reference:''});
export function demo(){return {schemaVersion:1,title:'Available fault current study',reference:'Example building · review layout',date:new Date().toISOString().slice(0,10),preparedBy:'',attachment:{type:'Standalone',reference:''},nodes:[
 {id:'utility',parent:null,kind:'source',name:'Utility transformer',fault:'F-01 · Transformer secondary',voltage:480,phase:3,method:'transformer',kva:500,z:3.5,tolerance:0,known:25000,sourceReference:'Example values — replace with utility data'},
 {id:'service',parent:'utility',kind:'disconnect',name:'Meterbase / service disconnect',fault:'F-02 · Service',rating:35,segments:[{...segment(),length:75,size:'350',material:'Al',raceway:'pvc',sets:2}]},
 {id:'main',parent:'service',kind:'panel',name:'Main panel',fault:'F-03 · MDP',rating:25,segments:[{...segment(),length:30,size:'500',sets:2}]},
 {id:'sub1',parent:'main',kind:'panel',name:'Sub panel 1',fault:'F-04 · Panel A',rating:10,segments:[{...segment(),length:50}]},
 {id:'sub2',parent:'main',kind:'panel',name:'Sub panel 2',fault:'F-05 · Panel B',rating:10,segments:[{...segment(),length:100,size:'2/0'}]},
 {id:'sub3',parent:'main',kind:'panel',name:'Sub panel 3',fault:'F-06 · Panel C',rating:10,segments:[{...segment(),length:150,size:'2'}]}
 ],documents:[]};}
