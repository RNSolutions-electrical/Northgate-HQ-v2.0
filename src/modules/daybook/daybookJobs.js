// One-way source directory only. This module never writes to HQ Jobs.
// Supply the existing authenticated Supabase client (never service-role credentials).
export const DAYBOOK_JOB_FIELDS = 'id,job_number,name,status,address_line1,address_line2,city,state,postal_code';
const text = value => typeof value === 'string' ? value.trim() : '';
export function daybookJobOption(row) {
  if (!row || !text(row.id)) throw new Error('HQ returned an invalid job record.');
  const locality = [text(row.city), [text(row.state), text(row.postal_code)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return {
    id: text(row.id), job_number: text(row.job_number), name: text(row.name),
    status: text(row.status),
    location: [text(row.address_line1), text(row.address_line2), locality].filter(Boolean).join(', '),
    // The canonical jobs table has no client/customer field. Do not guess from notes,
    // financials, contacts, or job names, and do not add another source of truth.
    client: null,
  };
}
export async function fetchDaybookHqJobs(client, {pageSize = 200, maxRows = 10000} = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000 || !Number.isInteger(maxRows) || maxRows < 1) {
    throw new Error('Invalid HQ Jobs paging limits.');
  }
  const jobs = [], seen = new Set();
  let after = null;
  for (;;) {
    // Production keeps existing Jobs authorization/RLS; no tool-toggle gateway is installed.
    let query = client.from('jobs').select(DAYBOOK_JOB_FIELDS).is('archived_at', null).order('id', {ascending: true}).limit(pageSize);
    if (after !== null) query = query.gt('id', after);
    const {data, error} = await query;
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('HQ returned an invalid jobs directory.');
    if (data.length === 0) break;
    for (const row of data) {
      const option = daybookJobOption(row);
      if (seen.has(option.id) || (after !== null && option.id <= after)) throw new Error('HQ Jobs changed while loading. Refresh the directory.');
      seen.add(option.id); jobs.push(option); after = option.id;
      if (jobs.length > maxRows) throw new Error('HQ Jobs exceeds the scheduling directory limit. No partial directory was loaded.');
    }
    // Continue even after a short page: hosted row caps may be smaller than pageSize.
  }
  return jobs;
}
