/** Temporary draft names are persisted once; they never change on reopening. */
export function draftName(at=new Date()){
 const d=at instanceof Date?at:new Date(at);
 if(!Number.isFinite(d.getTime()))throw new Error('Invalid draft creation time.');
 return 'Draft — '+new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(d);
}
export function withDraftIdentity(document,at=new Date()){
 if(document.name?.trim())return document;
 const created=document.draftCreatedAt||at.toISOString();
 return {...document,name:draftName(created),draftCreatedAt:created};
}
