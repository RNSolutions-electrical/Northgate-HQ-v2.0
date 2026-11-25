export function reviewRevisionLabel(value){
 if(value===0)return 'Not yet submitted';
 return Number.isSafeInteger(value)&&value>0?'Review rev. '+value:'Review revision unavailable';
}

export async function loadReviewRevisions(client,scope,ids){
 const unique=[...new Set(ids.filter(Boolean))],revisions=new Map();
 for(let start=0;start<unique.length;start+=200){
  const {data,error}=await client.rpc('read_estimate_review_revisions',{p_scope:scope,p_ids:unique.slice(start,start+200)});
  // This read is supplemental; a missing or unavailable RPC must not turn
  // a committed save/submission into a reported failure or invent a number.
  if(error)continue;
  for(const row of data||[])if(Number.isSafeInteger(row.review_revision)&&row.review_revision>=0)revisions.set(row.record_id,row.review_revision);
 }
 return revisions;
}

export async function attachReviewRevisions(client,scope,rows,idKey){
 try{
  const revisions=await loadReviewRevisions(client,scope,rows.map(row=>row[idKey]));
  return rows.map(row=>({...row,reviewRevision:revisions.get(row[idKey])??null}));
 }catch{return rows.map(row=>({...row,reviewRevision:null}));}
}
