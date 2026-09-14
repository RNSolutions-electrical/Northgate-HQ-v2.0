import {DEFAULT_SERVICE_STAGES, noChargeStage} from './serviceStages.js';
export const WORK_STAGES = Object.freeze(Object.fromEntries(DEFAULT_SERVICE_STAGES.filter(s=>s.kind==='work').map(s=>[s.key,s.label])));
export const BILLING_METHODS = Object.freeze({
  time_and_materials: 'Time & materials', quoted: 'Quoted',
  time_and_materials_plus_quote: 'Time & materials + quote', warranty_no_charge: 'Warranty / no charge',
});
// Directory-only stages follow the authorized ledger; never persist them as work stages.
export const DIRECTORY_STAGES = Object.freeze({ ...WORK_STAGES,
  invoice_sent: 'Invoice Sent', payment_received: 'Payment Received',
});
export function directoryStatus(call, today, stages=DEFAULT_SERVICE_STAGES) {
  const workStage = call.profile?.work_stage || (call.status === 'complete' ? 'complete' : 'upcoming');
  const label = key=>stages.find(s=>s.key===key)?.label || WORK_STAGES[key] || key;
  const stageLabel = label(workStage);
  if (call.archived_at) return {stage:'archived',label:label('archived'),tone:'archived'};
  if (['void', 'not_proceeding'].includes(workStage)) return { stage: workStage, label: stageLabel, tone: workStage };
  if (noChargeStage(call) && call.profile?.financially_closed_at) return {stage:workStage,label:stageLabel+' · Closed — no charge',tone:workStage};
  const financials = callFinancials(call, today);
  if (financials?.billingStatus === 'Overdue') return { stage: 'invoice_sent', label: label('invoice_sent')+' · Payment overdue', tone: 'overdue' };
  if (financials?.billingStatus === 'Paid') return { stage: 'payment_received', label: label('payment_received'), tone: 'paid' };
  if (['Invoiced', 'Part paid'].includes(financials?.billingStatus)) return {
    stage: 'invoice_sent', label: label('invoice_sent')+(financials.billingStatus === 'Part paid' ? ' · Part paid' : ''), tone: 'invoice_sent',
  };
  // Missing financial access is not proof that an invoice still needs sending.
  return { stage: workStage, label: stageLabel, tone: workStage === 'complete' && financials?.billingStatus === 'Not invoiced' ? 'ready' : '' };
}
export function cents(value = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 999999999999.99) throw new Error('Enter a valid currency amount.');
  return Math.round((number + Math.sign(number) * Number.EPSILON) * 100);
}
export function money(value = 0) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));
}
export function activePayments(invoice) {
  return (invoice.payments || []).filter((payment) => !payment.voided_at);
}
export function invoiceBalance(invoice) {
  return (cents(invoice.revenue_excluding_tax) + cents(invoice.sales_tax) + cents(invoice.credit_card_fee || 0) -
    activePayments(invoice).reduce((sum, payment) => sum + cents(payment.amount), 0)) / 100;
}
export function callFinancials(call, today = new Date().toLocaleDateString('en-CA')) {
  if (!call.financials) return null;
  const invoices = (call.financials.invoices || []).filter((item) => item.status === 'posted');
  const cost = (call.financials.costs || []).find((item) => item.is_active);
  const revenue = invoices.reduce((sum, item) => sum + cents(item.revenue_excluding_tax), 0);
  const tax = invoices.reduce((sum, item) => sum + cents(item.sales_tax), 0);
  const cardFee = invoices.reduce((sum, item) => sum + cents(item.credit_card_fee || 0), 0);
  const collected = invoices.reduce((sum, item) => sum + activePayments(item).reduce((s, p) => s + cents(p.amount), 0), 0);
  const costs = cents(cost?.total_hard_cost || 0);
  const balance = revenue + tax + cardFee - collected;
  return {
    revenue: revenue / 100, tax: tax / 100, cardFee: cardFee / 100, collected: collected / 100, cost: costs / 100,
    costKnown: !!cost, profit: cost ? (revenue - costs) / 100 : null,
    margin: cost && revenue ? ((revenue - costs) / revenue) * 100 : null,
    outstanding: balance / 100,
    billingStatus: invoices.length && invoices.every(i=>i.is_no_charge_closeout) ? 'Closed — no charge' : !invoices.length ? 'Not invoiced' : balance <= 0 ? 'Paid' :
      invoices.some((item) => item.due_date && item.due_date < today && invoiceBalance(item) > 0) ? 'Overdue' :
      collected > 0 ? 'Part paid' : 'Invoiced',
  };
}
export function allocationRemaining(total, allocations) {
  return (cents(total) - allocations.reduce((sum, item) => sum + cents(item.amount || 0), 0)) / 100;
}
export function normalizeCallNumber(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[–—]/g, '-').replace(/\s+/g, '');
}
const STAGE_MAP = {
  'received payment': 'complete', 'complete, ready to invoice': 'complete', invoiced: 'complete',
  'not likely to proceed': 'not_proceeding', 'in progress': 'in_progress', pursuit: 'pursuit',
  void: 'void', 'proposal sent': 'proposal_sent', upcoming: 'upcoming',
};
// Parse provided values only. No source formula execution and no database writes.
export function previewSource(rows, source) {
  const header = rows.findIndex((row) => row.some((v) => String(v).trim().toLowerCase() === (source === 'scorecard' ? 'job #' : 'job number')));
  if (header < 0) throw new Error(source === 'scorecard' ? 'Select the All Service Calls sheet with a Job # column.' : 'Select the Job #s sheet with a JOB NUMBER column.');
  const headers = rows[header].map((v) => String(v ?? '').trim().toLowerCase());
  return rows.slice(header + 1).flatMap((row, index) => {
    const get = (name) => row[headers.indexOf(name)] ?? '';
    const number = normalizeCallNumber(get(source === 'scorecard' ? 'job #' : 'job number'));
    if (!number || number.toLowerCase().includes('total')) return [];
    const issues = [];
    const amount = (name) => {
      const value = get(name);
      if (value === '') return null;
      const n = Number(String(value).replace(/[$,]/g, ''));
      if (!Number.isFinite(n)) { issues.push('Review ' + name + ': non-numeric/formula error'); return null; }
      if (n < 0) issues.push('Review negative ' + name);
      return cents(n) / 100;
    };
    const data = source === 'scorecard' ? {
      number, customer: get('business name') || [get('first name'), get('last name')].filter(Boolean).join(' '),
      business_name: get('business name'), first_name: get('first name'), last_name: get('last name'),
      phone: get('phone number'), email: get('email address'), address: get('service address'),
      scope: get('scope'), service_date: get('date of service'), lead: get('employee/lead'),
      quote: amount('estimate'), changes: amount('changes'), billed: amount('amount billed'),
      billed_date: get('date billed'), cost: amount('cost'), collected: amount('amount collected'),
      due_date: get('due date'), paid_date: get('paid date'),
    } : {
      number, customer: get('customer'), scope: get('description / notes'),
      billing_type: get('billing type'), work_stage: STAGE_MAP[String(get('job stage')).trim().toLowerCase()] || '',
      source_stage: get('job stage'), contact: get('home owner/customer'), phone: get('phone'),
      email: get('billing email'), address: get('address'), estimate_reference: get('estimate'),
      notes: get('notes'), attachments: get('attachments'),
    };
    if (source === 'registry' && data.source_stage && !data.work_stage) issues.push('Unrecognized job stage');
    if (source === 'registry' && /\b(009|010|012|013)\b|bill.*together|combined|lump/i.test(String(data.scope) + ' ' + String(data.notes))) issues.push('Review shared billing / linked calls');
    if (source === 'scorecard' && (data.collected || 0) > (data.billed || 0)) issues.push('Collected exceeds billed; review tax or overpayment');
    if (source === 'scorecard' && (data.billed || data.collected)) issues.push('Historical invoice/payment details require review; no ledger entries will be inferred');
    if (source === 'scorecard' && !data.billed_date) data.due_date = '';
    return [{ ...data, source, row: header + index + 2, issues }];
  });
}
export function combinePreview(registry, scorecard, existing = []) {
  const groups = new Map();
  for (const row of [...registry, ...scorecard]) {
    if (!groups.has(row.number)) groups.set(row.number, []);
    groups.get(row.number).push(row);
  }
  return [...groups].map(([number, sources]) => {
    const r = sources.find((s) => s.source === 'registry');
    const s = sources.find((s) => s.source === 'scorecard');
    const matches = existing.filter((call) => normalizeCallNumber(call.service_call_number || call.job_number) === number);
    const issues = sources.flatMap((row) => row.issues);
    if (sources.filter((row) => row.source === 'registry').length > 1 || sources.filter((row) => row.source === 'scorecard').length > 1) issues.push('Duplicate source number — do not merge automatically');
    if (!r || !s) issues.push('Only one spreadsheet contains this number');
    if (!matches.length) issues.push('Confirm this is a service call, not a regular project');
    if (matches.some((call) => call.archived_at)) issues.push('Existing call is archived');
    for (const key of ['customer', 'address', 'scope', 'phone', 'email']) {
      if (r?.[key] && s?.[key] && String(r[key]).trim().toLowerCase() !== String(s[key]).trim().toLowerCase()) issues.push('Different ' + key + ' values — review both sources');
    }
    return { number, customer: r?.customer || s?.customer || 'Unnamed', match: matches.length === 1 ? 'Exact number match' : matches.length > 1 ? 'Multiple existing matches' : 'New / review', sources, issues };
  }).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}
