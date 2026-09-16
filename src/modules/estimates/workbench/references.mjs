// Display references only: never mutate the saved document or approved snapshot.
// Component positions come from the complete saved lines array, not stage filters.
export const entryReference = number => String(number).padStart(3, '0');
export const workItemReference = (entry, item) => `${entryReference(entry.number)}.${item.number}`;
export const componentReference = (entry,item,index) => {
 const line=item.lines?.[index],group=item.components?.find(c=>c.id===line?.componentId);
 const suffix=group?(item.components.indexOf(group)+1)+'.'+(item.lines.filter(l=>l.componentId===group.id).indexOf(line)+1):index+1;
 return entry?workItemReference(entry,item)+'.'+suffix:'Component '+suffix;
};
