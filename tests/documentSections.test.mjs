import test from 'node:test';
import assert from 'node:assert/strict';
import {filterDocuments,documentSection,canClassifyDocument} from '../src/modules/documents/documentSections.js';
test('Document sections preserve historical ambiguity and filter metadata without changing identity',()=>{
 const rows=[{id:'one',owner_id:'job1',document_type:'plans',file_name:'plan.pdf',created_at:'2026-09-10',description:'Panel A'}, {id:'two',owner_id:'call1',document_type:'afc_calculations',document_section:'electrical',file_name:'report.pdf',description:'Panel B',created_at:'2026-09-15'}],before=structuredClone(rows);
 assert.equal(documentSection(rows[0]),'unclassified');
 assert.deepEqual(filterDocuments(rows,{section:'electrical',query:'panel b',from:'2026-09-11'}).map(x=>x.id),['two']);
 assert.deepEqual(filterDocuments(rows,{job:'job1',type:'plans',to:'2026-09-10'}).map(x=>x.id),['one']);assert.deepEqual(rows,before);
 assert.equal(canClassifyDocument({owner_type:'job',document_type:'afc_labels'}),false);
 assert.equal(canClassifyDocument({owner_type:'job',document_type:'plans'}),true);
});
