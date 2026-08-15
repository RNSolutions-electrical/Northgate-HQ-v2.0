export const JOB_DOCUMENT_CATEGORIES = Object.freeze([
  { key: 'contracts', label: 'Contracts', description: 'Executed agreements, contract exhibits, and award documents.' },
  { key: 'plans', label: 'Plans', description: 'Plan sets, drawings, sketches, and drawing revisions.' },
  { key: 'permits', label: 'Permits', description: 'Permit cards, applications, approvals, and inspection permit records.' },
  { key: 'photos', label: 'Photos', description: 'Job photos, progress photos, punch photos, and field condition records.' },
  { key: 'change_orders', label: 'Change Orders', description: 'Submitted, approved, and backup change-order documents.' },
  { key: 'closeout', label: 'Closeout Docs', description: 'As-builts, O&M manuals, warranties, lien waivers, and turnover records.' },
  { key: 'invoices', label: 'Invoices', description: 'Vendor, subcontractor, and project invoice documents.' },
  { key: 'misc', label: 'Misc', description: 'Project documents that do not fit another required category.' },
  { key: 'pay_apps', label: 'Pay Apps', description: 'Applications for payment, draw backup, and billing packages.' },
]);

export function documentCategoryLabel(value) {
  const category = JOB_DOCUMENT_CATEGORIES.find((item) => item.key === value);
  return category?.label ?? value ?? 'Uncategorized';
}
