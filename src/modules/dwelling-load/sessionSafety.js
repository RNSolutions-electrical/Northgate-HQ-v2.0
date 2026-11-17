// This is a client race guard, NOT token signature verification or an authorization boundary.
// Supabase still validates the JWT and enforces active-account/owner permissions server-side.
export function bindTokenToActor(getToken, owner, isActive) {
 return async options=>{
  if(!owner||!isActive())throw Error('Worksheet session changed. No request sent.');
  const token=await getToken(options);
  if(!isActive())throw Error('Worksheet session changed. No request sent.');
  let subject;
  try {const parts=token.split('.');if(parts.length!==3)throw Error();const payload=parts[1].replace(/-/g,'+').replace(/_/g,'/');subject=JSON.parse(atob(payload)).sub;}catch{throw Error('Could not verify worksheet session identity. No request sent.');}
  if(subject!==owner)throw Error('Worksheet account changed. No request sent.');
  return token;
 };
}
export function currentFrameMessage(message, generation){return message?.generation===generation;}
// Frame owns source inventory/form fields. Parent owns feeder reviews and photo refs.
// Merge independent edits rather than reloading a potentially stale full frame document.
export function mergeFramePayload(incoming,current){
 const merged=structuredClone(incoming);
 if(current?.feederStudies)merged.feederStudies=structuredClone(current.feederStudies);
 else delete merged.feederStudies;
 merged.rows=merged.rows.map(row=>{const old=current?.rows.find(r=>r.id===row.id);return old?.evidenceIds?{...row,evidenceIds:[...old.evidenceIds]}:row;});
 return merged;
}
