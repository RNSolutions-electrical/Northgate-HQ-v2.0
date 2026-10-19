import {financialDivisionLabel} from './financialDivisionLabels.js';
// Name metadata never replaces the stored financial values or historical text.
export function mergeFinancialNames(rows, names = {}) {
  const lines = new Map((names.lines || []).map(row => [row.id, row]));
  const divisions = new Map((names.divisions || []).map(row => [row.id, row]));
  return rows.map(row => ({...row, _financialName:lines.get(row.id),
    ...(row.project_division ? {project_division:{...row.project_division,_financialName:divisions.get(row.project_division.id)}} : {}),
    ...(row.source_project_division ? {source_project_division:{...row.source_project_division,_financialName:divisions.get(row.source_project_division.id)}} : {}),
  }));
}

export function resolvedDivisionName(division) {
  return division?._financialName?.effective_name ?? division?.name ?? '';
}

export function resolvedDivisionLabel(division) {
  const code=division?._financialName?.code ?? division?.code;
  const name=resolvedDivisionName(division);
  if(!division?._financialName)return financialDivisionLabel(code,name);
  return code ? `Division ${code} - ${name || 'Unnamed'}` : name || 'Unnamed project division';
}

export function resolvedLineName(line) {
  return line?._financialName?.effective_name ?? line?.description ?? '';
}

export function financialNamePatch({line, division, value}) {
  const common={id:line.id,description:line.description,expected_updated_at:line.updated_at};
  return division ? {...common,project_division_name_override:value?.trim() || null,
    expected_division_name_version:division._financialName.name_version}
    : {...common,name_override:value?.trim() || null};
}
