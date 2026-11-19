// Stages exact input strings without cloning/rendering the estimate on each key.
// Resolve is non-destructive: failed validation/save retains pending changes.
export function createWorkEditBuffer(){
 let current=null;const pending=new Map();
 return {
  reset(next){current=next;pending.clear();},
  stage(key,apply){if(current)pending.set(key,apply);},
  resolve(){if(!current)return null;const next=structuredClone(current);for(const apply of pending.values())apply(next.item);return next;},
 };
}
