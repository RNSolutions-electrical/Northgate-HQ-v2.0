import test from 'node:test';
import assert from 'node:assert/strict';
import {filterDocuments,documentSection,canClassifyDocument,departmentTags,documentJobChoices,sectionLabel} from '../src/modules/documents/documentSections.js';
test('Document sections preserve historical ambiguity and filter metadata without changing identity',()=>{
 const rows=[{id:'one',owner_id:'job1',document_type:'plans',file_name:'plan.pdf',created_at:'2026-09-10',description:'Panel A'}, {id:'two',owner_id:'call1',document_type:'afc_calculations',document_section:'electrical',file_name:'report.pdf',description:'Panel B',created_at:'2026-09-15'}],before=structuredClone(rows);
 assert.equal(documentSection(rows[0]),'unclassified');
 assert.deepEqual(filterDocuments(rows,{section:'electrical',query:'panel b',from:'2026-09-11'}).map(x=>x.id),['two']);
 assert.deepEqual(filterDocuments(rows,{job:'job1',type:'plans',to:'2026-09-10'}).map(x=>x.id),['one']);assert.deepEqual(rows,before);
 assert.equal(canClassifyDocument({owner_type:'job',document_type:'afc_labels'}),false);
 assert.equal(canClassifyDocument({owner_type:'job',document_type:'plans'}),true);
});
test('Department tags inherit legacy sections but an explicit empty array stays unclassified',()=>{
 assert.deepEqual(departmentTags({document_section:'electrical'}),['electrical']);
 assert.deepEqual(departmentTags({department_tags:[],document_section:'electrical'}),[]);
 assert.equal(sectionLabel({department_tags:['construction','electrical']}),'Construction, Electrical');
});
test('Department, type and custom-tag filters combine without changing document access or rows',()=>{
 const rows=[{id:'co',department_tags:['construction','electrical'],custom_tags:['client approval'],document_type:'change_orders'}, {id:'plan',department_tags:['electrical'],document_type:'plans'}];
 const before=structuredClone(rows);
 assert.deepEqual(filterDocuments(rows,{section:['construction','electrical'],type:'change_orders',tag:'client approval',query:'approval'}).map(d=>d.id),['co']);
 assert.equal(filterDocuments(rows,{section:'unclassified'}).length,0);
 assert.equal(filterDocuments(rows,{tag:'missing'}).length,0);
 assert.deepEqual(rows,before);
});
test('Signed Change Order organization is editable; archived and issued technical files retain source protection',()=>{
 assert.equal(canClassifyDocument({owner_type:'job',change_order_id:'co',document_type:'change_orders'}),true);
 assert.equal(canClassifyDocument({owner_type:'change_order',document_type:'change_orders'}),true);
 assert.equal(canClassifyDocument({owner_type:'job',archived_at:'2026-09-16'}),false);
 assert.equal(canClassifyDocument({owner_type:'job',storage_path:'afc/study/report.pdf'}),false);
});
test('Job choices exclude service calls without excluding their documents from search',()=>{
 assert.deepEqual(documentJobChoices([{id:'job',job_type:'job'},{id:'call',job_type:'service_call'},{id:'legacycall',service_call_number:'26-001'}]).map(j=>j.id),['job']);
 assert.equal(filterDocuments([{job_label:'26-001 - Call',owner_id:'call'}],{query:'26-001'}).length,1);
});
