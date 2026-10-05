const tokens = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '-').split('-').filter(Boolean);

export function suggestCatalogueCode({ category = '', subcategory = '', size = '', name = '' }, existingCodes = []) {
  const parts = [category, subcategory, size, name].flatMap(tokens).filter(Boolean);
  const base = parts.slice(0, 6).join('-').slice(0, 120) || 'MATERIAL';
  const used = new Set(existingCodes.map(code => String(code ?? '').trim().toUpperCase()));
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const code = `${base}-${suffix}`;
    if (!used.has(code)) return code;
  }
  return `${base}-${Date.now()}`;
}
