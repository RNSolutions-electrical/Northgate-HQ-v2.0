export function hasCheckoutNoteCoverage(lines, cartNote) {
  return Boolean(cartNote?.trim()) || lines.every(line => Boolean(line.note?.trim()));
}
