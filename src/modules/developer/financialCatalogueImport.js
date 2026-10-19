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
      is_protected_financial: row.is_protected_financial === true || String(row.is_protected_financial).toLowerCase() === 'true' || description.toLowerCase() === 'fee',
      sort_order: Number.isFinite(Number(row.sort_order ?? row['Sort Order'])) && String(row.sort_order ?? row['Sort Order'] ?? '').trim() !== ''
        ? Number(row.sort_order ?? row['Sort Order']) : index + 1,
    };
  }).filter((row) => row.cost_code && row.cost_code.toUpperCase() !== 'N/A' && row.division_code && row.division_name && row.description);
}

export function planFinancialCatalogueImport(raw, catalogue) {
  const keys=new Set();
  return raw.flatMap(source=>normalizeFinancialCatalogueRows([source]).map(row=>{
    const key=row.cost_code.trim().toUpperCase();
    if(keys.has(key))throw Error(`Duplicate imported cost code: ${row.cost_code}`);keys.add(key);
    const existing=catalogue.lines.find(line=>line.cost_code.trim().toUpperCase()===key);
    const division=catalogue.divisions.find(item=>item.code===row.division_code);
    if(division&&division.name!==row.division_name)throw Error(`Division ${division.code} is named "${division.name}" in the catalogue. Update the file or edit the master division first.`);
    return existing?{...row,
      category:source.category===undefined?existing.category:row.category,
      is_protected_financial:source.is_protected_financial===undefined?existing.is_protected_financial:row.is_protected_financial,
      notes:source.Notes===undefined&&source.notes===undefined?existing.notes:row.notes,
      subdivision_name:source['Sub-Division']===undefined&&source.subdivision_name===undefined?existing.subdivision_name:row.subdivision_name,
      sort_order:source['Sort Order']===undefined&&source.sort_order===undefined?existing.sort_order:row.sort_order,
      expected_version:existing.version}:row;
  }));
}
