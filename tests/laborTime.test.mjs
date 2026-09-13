import test from 'node:test';
import assert from 'node:assert/strict';
import {laborTime} from '../src/modules/estimates/workbench/laborTime.mjs';

test('labor reference converts decimal hours without changing saved values', () => {
  for (const [value, expected] of [[0,'0 hr 0 min'],[0.5,'0 hr 30 min'],[1.25,'1 hr 15 min'],[1.999,'2 hr 0 min'],[0.001,'<1 min'],['2.5','2 hr 30 min']]) {
    assert.equal(laborTime(value), expected);
  }
  for (const value of ['', ' ', null, undefined, -1, Infinity, 'invalid']) {
    assert.equal(laborTime(value), '');
  }
});
