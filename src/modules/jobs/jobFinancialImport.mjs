// Report preview is read-only. Only a single exact job cost-code match may be imported.
export function financialImportCostKey(value) {
  // 01 and 01.0 are distinct financial lines in the Northgate catalogue.
  return String(value || '').trim().toUpperCase().replace(/\s|,/g, '').replace(/[^A-Z0-9.]/g, '');
}

function amount(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(/[,$%\s()]/g, ''));
  if (!Number.isFinite(parsed)) return null;
  return /^\(.*\)$/.test(raw) ? -parsed : parsed;
}

function first(row, keys) {
  const key = keys.find((candidate) => row[candidate] !== undefined);
  return key ? String(row[key] ?? '') : '';
}

export function buildFinancialImportPreview({ sourceRows, text, financialLines }) {
  const codeHeaders = ['costcode', 'costcodes', 'code', 'costcodedescription', 'phasecode', 'phase', 'jobcostcode', 'costtypecode'];
  const estimateHeaders = ['estimatedcost', 'estimatedcosts', 'estimate', 'estcost', 'originalestimate', 'originalbudget', 'budget'];
  const actualHeaders = ['actual', 'actualcost', 'actualcosts', 'actualcostamount', 'actualamount', 'jobtodatecost', 'jtdcost', 'costtodate', 'actcost'];
  const revenueHeaders = ['revenue', 'revenueamount', 'sov', 'scheduleofvalues', 'billingvalue', 'contractvalue'];
  const byCode = new Map();
  for (const row of sourceRows) {
    const rawCode = first(row, codeHeaders).trim();
    const code = financialImportCostKey(rawCode);
    if (!code) continue;
    const amounts = { estimate: amount(first(row, estimateHeaders)), actual: amount(first(row, actualHeaders)), revenue: amount(first(row, revenueHeaders)) };
    if (Object.values(amounts).every((value) => value === null)) continue;
    const previous = byCode.get(code) || { code, rawCode, division: rawCode.match(/^\d{1,2}/)?.[0]?.padStart(2, '0') || '', estimate: null, actual: null, revenue: null };
    for (const field of ['estimate', 'actual', 'revenue']) if (amounts[field] !== null) previous[field] = (previous[field] ?? 0) + amounts[field];
    byCode.set(code, previous);
  }
  if (!byCode.size) {
    const money = '(-?\\(?\\$?[\\d,]+\\.\\d{2}\\)?)';
    const detailed = new RegExp('^(\\d{1,3}(?:\\.\\d+)*)\\s+.+?\\s+' + money + '\\s+' + money + '\\s+' + money + '\\s+' + money + '$');
    String(text || '').split(/\r?\n/).forEach((line) => {
      const raw = line.trim();
      if (!raw || /^total\b/i.test(raw)) return;
      const match = raw.match(detailed);
      if (!match) return;
      const rawCode = match[1];
      const code = financialImportCostKey(rawCode);
      const previous = byCode.get(code) || { code, rawCode, division: rawCode.match(/^\d{1,2}/)?.[0]?.padStart(2, '0') || '', estimate: 0, actual: 0, revenue: null };
      previous.estimate += amount(match[2]) || 0;
      previous.actual += amount(match[3]) || 0;
      byCode.set(code, previous);
    });
  }
  if (!byCode.size) throw new Error('No cost-code amounts could be read. Use a cost report with cost codes and Estimate, Actual, or Revenue columns.');
  const linesByCode = new Map();
  for (const line of financialLines) {
    const code = financialImportCostKey(line.cost_code);
    if (!code || /\.CO$/i.test(String(line.cost_code || ''))) continue;
    linesByCode.set(code, [...(linesByCode.get(code) || []), line]);
  }
  return [...byCode.values()].map((row) => ({ ...row, matches: linesByCode.get(row.code) || [] }))
    .sort((a, b) => a.rawCode.localeCompare(b.rawCode, undefined, { numeric: true }));
}
