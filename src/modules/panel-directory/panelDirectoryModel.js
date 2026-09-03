export const CIRCUIT_COUNTS = [12, 18, 24, 30, 36, 42, 54, 60, 72, 84];
export const emptyPanel = () => ({
  id: null, designation: "Panel 'A'", phase_type: 'three_phase', system_voltage: '120208', circuit_count: 42,
  phase_color_coding: true, circuits: { schema_version: 1, items: {} }, job_number: '', project_name: '',
  client_name: '', project_address: '', panel_location: '', notes: '',
});

export function normalizePanel(value = {}) {
  const base = emptyPanel();
  return { ...base, ...value, circuits: { schema_version: 1, items: {}, ...(value.circuits || {}), items: { ...(value.circuits?.items || {}) } } };
}

export function cleanCircuits(items) {
  return Object.fromEntries(Object.entries(items || {}).filter(([, item]) => String(item.description || '').trim() || Number(item.poles || 1) > 1 || item.emergency));
}

export function circuitLayout(panel) {
  const starts = new Map(); const claims = new Map(); const invalid = new Set();
  Object.entries(panel.circuits?.items || {}).forEach(([key, raw]) => {
    const start = Number(key); const poles = Number(raw.poles || 1);
    if (!Number.isInteger(start) || start < 1 || start > panel.circuit_count || ![1, 2, 3].includes(poles) || (panel.phase_type === 'single_phase' && poles > 2) || start + ((poles - 1) * 2) > panel.circuit_count) { invalid.add(key); return; }
    for (let index = 0; index < poles; index += 1) {
      const position = start + (index * 2);
      if (claims.has(position)) { invalid.add(key); invalid.add(String(claims.get(position))); }
      claims.set(position, start);
    }
    starts.set(start, { ...raw, poles });
  });
  return { starts, claims, invalid };
}

export function phaseTone(panel, number) {
  if (!panel.phase_color_coding || panel.system_voltage === 'other') return '';
  const sideIndex = Math.floor((number - 1) / 2) % (panel.phase_type === 'single_phase' ? 2 : 3);
  const voltage = panel.system_voltage === '120208' ? '120' : '480';
  return `panel-directory__phase-${['a', 'b', 'c'][sideIndex]}-${voltage}`;
}
