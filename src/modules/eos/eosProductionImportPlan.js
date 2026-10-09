// A read-only plan, not an import endpoint. Production writes require a
// separately reviewed importer and release authorization.
export const EOS_SOURCE_BATCH = 'eos-workbook-2026-20261006';
export const EOS_SOURCE_SHEETS = Object.freeze({
  General: '2026 Pursuits&Estimates',
  Electrical: '2026 Electrical Pursuits',
});

const textOrNull = (value) => typeof value === 'string' && value.trim() ? value : null;

export function planEosProductionImport(seed) {
  if (!Array.isArray(seed?.rows) || !Array.isArray(seed?.clients)) {
    throw new Error('EOS source rows and clients are required.');
  }
  const clientsById = new Map();
  const labels = new Set();
  for (const client of seed.clients) {
    if (!client?.id || !textOrNull(client.name) || clientsById.has(client.id)
      || labels.has(client.name)) throw new Error('Duplicate or incomplete EOS source client.');
    clientsById.set(client.id, client);
    labels.add(client.name);
  }

  const keys = new Set();
  const pursuits = [];
  for (const row of seed.rows) {
    if (!textOrNull(row?.name)) continue;
    const source_sheet = EOS_SOURCE_SHEETS[row.source];
    if (!source_sheet || !Number.isInteger(row.sourceRow)) {
      throw new Error('Named EOS pursuit has an invalid source identity.');
    }
    const key = `${source_sheet}:${row.sourceRow}`;
    if (keys.has(key)) throw new Error(`Duplicate EOS source identity: ${key}`);
    keys.add(key);
    const sourceClient = row.client ? clientsById.get(row.client) : null;
    if (row.client && !sourceClient) throw new Error(`Unknown EOS source client in ${key}`);
    pursuits.push({
      source_sheet, source_row: row.sourceRow, source_batch: EOS_SOURCE_BATCH,
      project_name: row.name.trim(), client_source_label: sourceClient?.name ?? null,
      discussion: textOrNull(row.notes), phase: row.phase || null,
      planning_value: row.value ?? null, probability: row.probability ?? null,
      potential_start_date: textOrNull(row.start), go_no_go: textOrNull(row.go),
      initial_meeting: textOrNull(row.initial),
      source_manager_labels: [...(row.managers || [])],
      original_stage: textOrNull(row.originalPhase),
      original_job_number: textOrNull(row.job),
      job_id: null, manager_ids: [], phase_before_award: null,
    });
  }
  return {
    batch: EOS_SOURCE_BATCH,
    clients: seed.clients.map((client) => ({
      source_label: client.name, display_name: client.name,
      company: textOrNull(client.company), phone: textOrNull(client.phone),
      email: textOrNull(client.email), address: textOrNull(client.address),
      notes: textOrNull(client.notes),
    })),
    pursuits,
    counts: {
      pursuits: pursuits.length,
      general: pursuits.filter((row) => row.source_sheet === EOS_SOURCE_SHEETS.General).length,
      electrical: pursuits.filter((row) => row.source_sheet === EOS_SOURCE_SHEETS.Electrical).length,
      clients: seed.clients.length,
      blankClients: pursuits.filter((row) => row.client_source_label === null).length,
      sourceJobNumbersRetainedOnly: pursuits.filter((row) => row.original_job_number).length,
      linkedJobs: pursuits.filter((row) => row.job_id).length,
      assignedManagers: pursuits.reduce((sum, row) => sum + row.manager_ids.length, 0),
    },
  };
}
