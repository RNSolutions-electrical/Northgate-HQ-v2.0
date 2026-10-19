import test from 'node:test';
import assert from 'node:assert/strict';
import { financialDivisionName, financialDivisionLabel, financialLineDescription } from '../src/modules/jobs/financialDivisionLabels.js';
import { normalizeFinancialCatalogueRows } from '../src/modules/developer/financialCatalogueImport.js';
import { BUDGET_TEMPLATES } from '../src/modules/jobs/gablesServiceTemplate.js';
import { buildFinancialExportRows } from '../src/modules/jobs/jobFinancialExport.mjs';
import { buildFinancialImportPreview } from '../src/modules/jobs/jobFinancialImport.mjs';

const canonical = 'Thermal & Moisture Protection';
const typo = 'Thermal&  MoistureProtection';
test('Division 07 catalogue alias and built-in template use the canonical label', () => {
  for (const name of [typo, canonical, 'Thermal& MoistureProtection']) {
    assert.equal(financialDivisionName('07', name), canonical);
    assert.equal(financialDivisionLabel('07', name), `Division 07 - ${canonical}`);
  }
  assert.equal(BUDGET_TEMPLATES[0].divisions.find(d => d.code === '07').name, canonical);
});
test('catalogue workbook import repairs only verified Division 07 names and generated descriptions', () => {
  const normalized = normalizeFinancialCatalogueRows([
    {Division:`07 ${typo}`, 'Cost Code':'07', Name:'N/A'},
    {Division:`07 ${typo}`, 'Cost Code':'07.1', Name:'Roofing & Flashing Labor'},
    {Division:`07 ${typo}`, 'Cost Code':'07.CO', Name:`${typo} Change Orders`},
    {Division:'07 Thermal & Moisture Protection - East Wing', 'Cost Code':'07.99', Name:'Custom  Labor & Materials'},
  ]);
  assert.deepEqual(normalized.slice(0,3).map(r => r.division_name), [canonical,canonical,canonical]);
  assert.equal(normalized[0].description, canonical);
  assert.equal(normalized[1].description, 'Roofing & Flashing Labor');
  assert.equal(normalized[2].description, `${canonical} Change Orders`);
  assert.equal(normalized[3].division_name, 'Thermal & Moisture Protection - East Wing');
  assert.equal(normalized[3].description, 'Custom  Labor & Materials');
});
test('manual/custom names and stored descriptions are not rewritten', () => {
  for (const name of ['Owner  Custom &Name', 'Thermal& MoistureProtection - West', 'Roofing & Flashing Labor']) {
    assert.equal(financialDivisionName('07',name),name);
    assert.equal(financialLineDescription({cost_code:'07.1',description:name}),name);
  }
  assert.equal(financialDivisionName('08',typo),typo);
});
test('report matching and export preserve line identity and source data while displaying canonical names', () => {
  const line = {id:'top',cost_code:'07',description:typo,project_division:{id:'d7',code:'07',name:typo},budget_amount:2500,actual_cost_amount:1000};
  const before = JSON.stringify(line);
  const preview = buildFinancialImportPreview({sourceRows:[{costcode:'07',actual:'(25.50)'}],text:'',financialLines:[line]});
  assert.equal(preview[0].matches[0],line);
  assert.equal(preview[0].actual,-25.5);
  const exported = buildFinancialExportRows([line])[0];
  assert.equal(exported.projectDivisionName,canonical);
  assert.equal(exported.description,canonical);
  assert.equal(exported.budget,2500);
  assert.equal(exported.costs,1000);
  assert.equal(JSON.stringify(line),before);
});
