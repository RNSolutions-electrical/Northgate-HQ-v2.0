import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinancialImportPreview, financialImportCostKey } from '../src/modules/jobs/jobFinancialImport.mjs';

test('preserves top-level and decimal cost-code identities', () => {
  assert.notEqual(financialImportCostKey('01'), financialImportCostKey('01.0'));
  const rows = buildFinancialImportPreview({
    sourceRows: [
      { costcode: '01', estimatedcost: '100.00', actualcost: '25.00', revenue: '150.00' },
      { costcode: '01.0', estimatedcost: '200.00', actualcost: '50.00', revenue: '300.00' },
    ],
    text: '',
    financialLines: [{ id: 'top', cost_code: '01' }, { id: 'sub', cost_code: '01.0' }],
  });
  assert.deepEqual(rows.map((row) => [row.rawCode, row.matches[0]?.id]), [['01', 'top'], ['01.0', 'sub']]);
  assert.equal(rows[1].revenue, 300);
});

test('sums repeated report codes and flags unmatched or ambiguous job lines', () => {
  const rows = buildFinancialImportPreview({
    sourceRows: [
      { costcode: '16.11', actual: '$1,200.50' },
      { costcode: '16.11', actual: '(200.25)' },
      { costcode: '16.12', actual: '0' },
      { costcode: '16.13', actual: '5' },
    ],
    text: '',
    financialLines: [{ id: 'a', cost_code: '16.11' }, { id: 'b', cost_code: '16.11' }, { id: 'c', cost_code: '16.12' }],
  });
  assert.equal(rows[0].actual, 1000.25);
  assert.equal(rows[0].matches.length, 2);
  assert.equal(rows[1].actual, 0);
  assert.equal(rows[2].matches.length, 0);
});

test('reads four-amount PDF text without collapsing 01 and 01.0', () => {
  const rows = buildFinancialImportPreview({
    sourceRows: [],
    text: '01 General Requirements $100.00 $25.00 $0.00 $0.00\n01.0 Equipment Rental $200.00 $50.00 $0.00 $0.00',
    financialLines: [{ id: 'top', cost_code: '01' }, { id: 'sub', cost_code: '01.0' }],
  });
  assert.deepEqual(rows.map((row) => row.actual), [25, 50]);
  assert.deepEqual(rows.map((row) => row.matches[0]?.id), ['top', 'sub']);
});

test('rejects files without recognizable cost-code values', () => {
  assert.throws(() => buildFinancialImportPreview({ sourceRows: [{ title: 'No codes' }], text: '', financialLines: [] }), /No cost-code amounts/);
});
