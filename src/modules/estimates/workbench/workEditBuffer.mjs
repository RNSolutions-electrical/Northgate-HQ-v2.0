// Stages exact input strings without cloning/rendering the estimate on each key.
// Resolve is non-destructive: failed validation/save retains pending changes.
const fingerprint=edit=>JSON.stringify(edit, (key,value)=>key==='internalReview'&&value===false?undefined:value);
export function createWorkEditBuffer(){
 let current=null,initial=null;const pending=new Map();
 function reset(next){current=next;pending.clear();}
 function resolve(){if(!current)return null;const next=structuredClone(current);for(const apply of pending.values())apply(next.item);return next;}
 return {
  begin(next){reset(next);initial=fingerprint(next);},
  reset,
  stage(key,apply){if(current)pending.set(key,apply);},
  resolve,
  hasChanges(){return current!==null&&fingerprint(resolve())!==initial;},
 };
}
