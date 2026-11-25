import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,PDFTextField,PDFDropdown,PDFCheckBox} from 'pdf-lib';
import {supplierRfqRows,supplierRfqCsv,supplierRfqPdf} from './supplierRfq.mjs';

const row=(name,opts={})=>({name,unit:'FT',qty:'0.1',blankResourceKind:'material',price:'123.42',hours:'237',notes:'PRIVATE NOTE',...opts});
const data={name:'PRIVATE ESTIMATE',customer:'PRIVATE CUSTOMER',notes:'SECRET',entries:[{items:[
 {qty:3,lines:[row('Steel conduit',{catalogueId:'a'}),row('Steel conduit',{catalogueId:'a',fixed:true,qty:2}),row('Labor',{blankResourceKind:'labor'}),row('Legacy labor',{blankResourceKind:undefined,unit:'HR'}),row('Connector',{unit:'EA',partNumber:'BCA-2',qty:1}),row('Connector',{unit:'EA',partNumber:'BCA-3',qty:2})],blankQuotes:[{mode:'add',name:'PRIVATE ADD QUOTE'}]},
 {qty:2,lines:[row('Do not send')],blankQuotes:[{mode:'replace'}]},
]}],blankWorkDrafts:[{item:{qty:1,lines:[row('Unsaved material')]}}]};
const catalogue=[{id:'a',unit:'FT',material_code:'C-1',catalogue_notes:'PRIVATE CATALOG NOTES'}];
test('material request groups matching parts and units with exact included quantities only',()=>{
 assert.deepEqual(supplierRfqRows(data,catalogue),[
  {description:'Steel conduit',part:'C-1',unit:'FT',quantity:'2.3'},
  {description:'Connector',part:'BCA-2',unit:'EA',quantity:'3'},
  {description:'Connector',part:'BCA-3',unit:'EA',quantity:'6'},
 ]);
 assert.throws(()=>supplierRfqRows({entries:[]}),/Add included materials/);
 assert.equal(supplierRfqRows({entries:[{items:[{qty:0.2,lines:[row('No cost required',{price:null,hours:null})]}]}]})[0].quantity,'0.02');
});
test('CSV leaves supplier response blank, labels pricing optional, and protects formula starts',()=>{
 const text=supplierRfqCsv([...supplierRfqRows(data,catalogue),{description:'=SUM(1,2)',part:' +danger',unit:'"EA"',quantity:'1'}]);
 assert.match(text, /"Material description","Internal Cat\. #","Quantity"/);
 assert.match(text,/"Supplier unit price \(optional\)","On hand \(Yes\/No\)","Lead time \(days\)","Day basis \(Business\/Calendar\)"/);
 assert.match(text,/"Steel conduit","C-1","2.3","FT","","","",""/);
 assert.match(text,/"'=SUM\(1,2\)","'\+danger","1","""EA"""/);
 assert.match(text,/Unit pricing is optional\. Any line-item pricing you can share helps us bid accurately and creates more opportunities for us to work together\./);
 assert.match(text,/"Supplier quote total","","","","","","",""\r\n$/);
 assert.doesNotMatch(text,/PRIVATE|123\.42|237|Unsaved material/);
});
test('PDF has blank editable response fields, paginates, and can round-trip vendor entries',async()=>{
 const rows=[...supplierRfqRows(data,catalogue),...Array.from({length:28},(_,i)=>({description:'Fixture '+i,part:'M-'+i,unit:'EA',quantity:'4'}))];
 const pdf=await PDFDocument.load(await supplierRfqPdf(rows));
 const form=pdf.getForm();assert.ok(pdf.getPageCount()>1);
 assert.equal(form.getFields().length,4*rows.length+1);
 assert.ok(form.getTextField('Row 1 supplier unit price') instanceof PDFTextField);
 assert.equal(form.getTextField('Row 1 supplier unit price').getText(),undefined);
 assert.ok(form.getCheckBox('Row 1 on hand') instanceof PDFCheckBox);
 assert.equal(form.getCheckBox('Row 1 on hand').isChecked(),false);
 const basis=form.getDropdown('Row 1 lead time basis');assert.ok(basis instanceof PDFDropdown);
 assert.deepEqual(basis.getOptions(),[' ','Business days','Calendar days']);
 assert.equal(form.getTextField('Supplier quote total').getText(),undefined);
 form.getTextField('Row 1 supplier unit price').setText('11.25');
 form.getCheckBox('Row 1 on hand').check();
 form.getTextField('Row 2 lead time days').setText('12');
 form.getDropdown('Row 2 lead time basis').select('Business days');
 form.getTextField('Supplier quote total').setText('45.00');
 const response=(await PDFDocument.load(await pdf.save())).getForm();
 assert.equal(response.getTextField('Row 1 supplier unit price').getText(),'11.25');
 assert.equal(response.getCheckBox('Row 1 on hand').isChecked(),true);
 assert.deepEqual(response.getDropdown('Row 2 lead time basis').getSelected(),['Business days']);
 assert.equal(response.getTextField('Supplier quote total').getText(),'45.00');
});
