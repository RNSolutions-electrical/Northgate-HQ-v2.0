export const DOCUMENT_GROUPS=Object.freeze([
 {key:'construction',label:'Construction Documents'},
 {key:'electrical',label:'Electrical Documents'},
 {key:'general',label:'General Documents'},
 {key:'unclassified',label:'Unclassified'},
]);
export const documentSection=row=>row.document_section||'unclassified';
export const sectionLabel=row=>DOCUMENT_GROUPS.find(s=>s.key===documentSection(row))?.label||'Unclassified';
export function filterDocuments(rows,{section='',query='',type='',job='',from='',to=''}={}){
 const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
 return rows.filter(r=>(!section||documentSection(r)===section)&&(!type||r.document_type===type)&&(!job||(r.job_id||r.owner_id)===job)&&(!from||r.created_at?.slice(0,10)>=from)&&(!to||r.created_at?.slice(0,10)<=to)&&terms.every(term=>[r.file_name,r.job_label,r.description,r.document_type,r.equipment,r.division].filter(Boolean).join(' ').toLowerCase().includes(term)));
}
export function canClassifyDocument(row){return ['job','estimate'].includes(row.owner_type)&&!row.change_order_id&&!row.storage_path?.startsWith('afc/')&&!['afc_calculations','afc_labels','service_inspections','panel_directories','electrical_testing'].includes(row.document_type);}
