export const PROJECT_DIVISION_NAMES = Object.freeze({
  '01': 'General Requirements', '02': 'Site Work', '03': 'Concrete', '04': 'Masonry', '05': 'Metals',
  '06': 'Woods and Plastics', '07': 'Thermal & Moisture Protection', '08': 'Doors and Windows',
  '09': 'Finishes', '10': 'Specialties', '15': 'Mechanical', '16': 'Electrical',
});

// Correct only the verified catalogue spelling, never arbitrary custom labels.
export function financialDivisionName(code, name) {
  if (String(code) === '07' && /^Thermal\s*&\s*Moisture\s*Protection$/i.test(String(name || '').trim())) {
    return PROJECT_DIVISION_NAMES['07'];
  }
  return name || '';
}

export function financialDivisionLabel(code, name) {
  return code ? `Division ${code} - ${financialDivisionName(code, name) || 'Unnamed'}` : name || 'Unnamed project division';
}

export function financialLineDescription(line) {
  const description = line.description || '';
  if (line.cost_code === '07') return financialDivisionName('07', description);
  if (line.cost_code === '07.CO' && / Change Orders$/.test(description)) {
    return `${financialDivisionName('07', description.slice(0, -14))} Change Orders`;
  }
  return description;
}
