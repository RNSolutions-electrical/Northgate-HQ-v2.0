// Display references only: never mutate the saved document or approved snapshot.
// Component positions come from the complete saved lines array, not stage filters.
export const entryReference = number => String(number).padStart(3, '0');
export const workItemReference = (entry, item) => `${entryReference(entry.number)}.${item.number}`;
export const componentReference = (entry, item, index) => entry
 ? `${workItemReference(entry, item)}.${index + 1}`
 : `Component ${index + 1}`;
