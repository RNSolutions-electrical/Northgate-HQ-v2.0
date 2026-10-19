import { financialDivisionName, financialLineDescription } from '../jobs/financialDivisionLabels.js';

export function normalizeFinancialCatalogueRows(rows) {
  return rows.map((row, index) => {
    const division = String(row.Division ?? row.division ?? row.division_name ?? '').trim();
    const code = String(row['Cost Code'] ?? row.cost_code ?? '').trim();
    const description = String(row.Name ?? row.description ?? '').trim();
    const divisionCode = String(row.division_code ?? division.match(/^\d{2}/)?.[0] ?? '').trim();
    const divisionName = financialDivisionName(divisionCode, division.replace(/^\d{2}\s*/, '').trim());
    return {
      division_code: divisionCode,
      division_name: divisionName,
      subdivision_name: String(row['Sub-Division'] ?? row.subdivision_name ?? '').trim().replace(/^-$/, ''),
      cost_code: code,
      description: financialLineDescription({cost_code:code, description:description === 'N/A' ? divisionName : description}),
      notes: String(row.Notes ?? row.notes ?? '').trim().replace(/^N\/A$/i, ''),
      category: String(row.category ?? (description.toLowerCase() === 'fee' ? 'ohp_fee' : 'other')).trim(),
      is_protected_financial: row.is_protected_financial === true || description.toLowerCase() === 'fee',
      sort_order: Number(row.sort_order) || index + 1,
    };
  }).filter((row) => row.cost_code && row.cost_code.toUpperCase() !== 'N/A' && row.division_code && row.division_name && row.description);
}
