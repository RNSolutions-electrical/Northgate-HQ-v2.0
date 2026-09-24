const RESPONSIBILITY_LABELS = Object.freeze({
  superintendent: 'Superintendent',
  construction_pm: 'Construction Project Manager',
  electrical_pm: 'Electrical Project Manager',
  electrical_lead: 'Electrical Lead',
});

const RESPONSIBILITY_ORDER = Object.keys(RESPONSIBILITY_LABELS);

export function mergeDashboardJobAssignments(memberships = [], responsibilities = [], visibleJobs = []) {
  const jobs = new Map();
  const visibleById = new Map(visibleJobs.map((job) => [job.id, job]));

  for (const assignment of memberships) {
    const job = assignment.job;
    if (!job?.id) continue;
    const existing = jobs.get(job.id) || { ...job, roles: new Set(), assigned_at: assignment.assigned_at };
    existing.roles.add('Project member');
    jobs.set(job.id, existing);
  }

  for (const assignment of responsibilities) {
    const job = visibleById.get(assignment.job_id);
    const label = RESPONSIBILITY_LABELS[assignment.responsibility];
    if (!job || !label) continue;
    const existing = jobs.get(job.id) || { ...job, roles: new Set(), assigned_at: assignment.assigned_at };
    existing.roles.add(label);
    jobs.set(job.id, existing);
  }

  return [...jobs.values()]
    .map((job) => ({
      ...job,
      role_labels: [
        ...RESPONSIBILITY_ORDER.map((key) => RESPONSIBILITY_LABELS[key]).filter((label) => job.roles.has(label)),
        ...(job.roles.has('Project member') ? ['Project member'] : []),
      ].join(', '),
      roles: undefined,
    }))
    .sort((a, b) => (a.job_number || a.name || '').localeCompare(b.job_number || b.name || ''));
}
