// Self-contained for host + sandbox use. Preserve newer edits, never merge source fields piecemeal.
export function reconcileWorksheetSave(submitted,saved,working,hasNewerEdits=false){
 const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
 const newer=hasNewerEdits||canonical(working)!==canonical(submitted);
 const sanitized=Boolean(submitted?.assistedReview?.sourceContext&&saved?.assistedReview&&saved.assistedReview.sourceContext===null);
 const payload=structuredClone(newer?working:saved);
 if(newer&&sanitized&&payload.assistedReview)payload.assistedReview.sourceContext=null;
 return {payload,dirty:newer,guidedSanitized:sanitized};
}
