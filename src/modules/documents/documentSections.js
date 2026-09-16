export const DOCUMENT_GROUPS=Object.freeze([
 {key:'construction',label:'Construction Documents'},
 {key:'electrical',label:'Electrical Documents'},
 {key:'general',label:'General Documents'},
 {key:'unclassified',label:'Unclassified'},
]);
export const departmentTags=row=>row.department_tags??(row.document_section?[row.document_section]:[]);
export const documentSection=row=>departmentTags(row)[0]||'unclassified';
export const sectionLabel=row=>departmentTags(row).map(key=>DOCUMENT_GROUPS.find(s=>s.key===key)?.label.replace(' Documents','')||key).join(', ')||'Unclassified';
export const documentTagsLabel=row=>[sectionLabel(row),...(row.custom_tags||[])].join(' · ');
export const selectedSections=value=>Array.isArray(value)?value:value?[value]:[];
export function matchesDocumentSections(row,value){return selectedSections(value).every(key=>key==='unclassified'?departmentTags(row).length===0:departmentTags(row).includes(key));}
export const documentJobChoices=jobs=>jobs.filter(j=>j.job_type!=='service_call'&&!j.service_call_number);
export function filterDocuments(rows,{section='',tag='',query='',type='',job='',from='',to=''}={}){
 const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
 return rows.filter(r=>matchesDocumentSections(r,section)&&(!tag||r.custom_tags?.includes(tag))&&(!type||r.document_type===type)&&(!job||(r.job_id||r.owner_id)===job)&&(!from||r.created_at?.slice(0,10)>=from)&&(!to||r.created_at?.slice(0,10)<=to)&&terms.every(term=>[r.file_name,r.job_label,r.description,r.document_type,r.equipment,r.division,...departmentTags(r),...(r.custom_tags||[])].filter(Boolean).join(' ').toLowerCase().includes(term)));
}
export function canClassifyDocument(row){return !row.archived_at&&['job','estimate','change_order'].includes(row.owner_type)&&!row.storage_path?.startsWith('afc/')&&!['afc_calculations','afc_labels','service_inspections','panel_directories','electrical_testing'].includes(row.document_type);}
