import { getSupabaseAccessToken } from '../../services/clerkToken.js';
import { useAuth, useUser } from '@clerk/clerk-react';
import {AttachedEstimates} from '../estimates/AttachedEstimates.jsx';
import { Archive, ArrowLeft, Ban, Copy, Download, FileCheck2, Plus, Save, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { createSupabaseClient } from '../../services/supabaseClient.js';
import { adjustmentLineTotal, serializeAdjustmentLines, isEditableAdjustment } from './contractAdjustments.js';
import { editableChangeOrderLines, lineSubtotal, percentMarkupAmount, withUpdatedLineMarkup } from './changeOrderMarkup.js';

const DOCUMENT_BUCKET = 'northgate-files';
const MONEY_FIELDS = ['material_amount', 'labor_amount', 'equipment_amount', 'subcontract_amount', 'other_amount', 'markup_amount'];

function blankLine(budgetLine = null, sortOrder = 0) {
  return {
    key: crypto.randomUUID(),
    job_budget_line_id: budgetLine?.id || '',
    description: budgetLine?.description || '',
    vendor_name: '',
    material_amount: '',
    labor_amount: '',
    equipment_amount: '',
    subcontract_amount: '',
    other_amount: '',
    markup_amount: '',
    markup_mode: 'percent',
    markup_percent: '',
    sort_order: sortOrder,
  };
}

function lineTotal(line) {
  return adjustmentLineTotal(line);
}

function money(value) {
  if (value === null || value === undefined || value === '') return 'Not priced';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
}

function isChangeOrderBudgetLine(line) {
  return /\.CO$/i.test(String(line?.cost_code || '').trim());
}

function compareBudgetLines(left, right) {
  const leftDivisionOrder = left?.project_division?.sort_order ?? Number(String(left?.cost_code || '').match(/^\d+/)?.[0] || 999);
  const rightDivisionOrder = right?.project_division?.sort_order ?? Number(String(right?.cost_code || '').match(/^\d+/)?.[0] || 999);
  if (leftDivisionOrder !== rightDivisionOrder) return leftDivisionOrder - rightDivisionOrder;
  return String(left?.cost_code || '').localeCompare(String(right?.cost_code || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function sanitizeFileName(value) {
  return String(value || 'signed-change-order.pdf').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'signed-change-order.pdf';
}

function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

function htmlMultiline(value, fallback = '') {
  return htmlEscape(value || fallback).replace(/\n/g, '<br>');
}

function clientChangeOrderHtml({ order, job, form, lines, overallMarkupAmount, total, logoUrl }) {
  const documentType = order.record_type === 'credit' ? 'Credit' : 'Change Order';
  const projectAddress = [job.address_line1, job.address_line2, [job.city, job.state, job.postal_code].filter(Boolean).join(', ')]
    .filter(Boolean).join('<br>');
  const rows = lines.map((line, index) => `<tr><td>${index + 1}</td><td>${htmlMultiline(line.description, 'Change Order item')}</td><td>${money(lineTotal(line))}</td></tr>`).join('')
    + (overallMarkupAmount ? `<tr><td>${lines.length + 1}</td><td>General Contractor Fee</td><td>${money(overallMarkupAmount)}</td></tr>` : '');
  const issuedDate = form.change_order_date ? new Date(`${form.change_order_date}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(order.co_number)} ${documentType}</title><style>
    @page{size:letter;margin:.4in}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#17202a;font-size:9.75pt;line-height:1.32;background:#fff}.sheet{max-width:7.7in;margin:0 auto}.brand{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:5px solid #c9202f;padding:0 0 8px}.brand__identity{width:330px}.brand__logo{width:310px;height:76px;display:flex;align-items:center}.brand__logo img{display:block;width:100%;height:100%;object-fit:contain;object-position:left center}.document-title{text-align:right}.document-title strong{display:block;font-size:18pt;text-transform:uppercase}.document-title span{color:#c9202f;font-size:11.5pt;font-weight:700}.meta{display:grid;grid-template-columns:1.25fr .75fr;margin:13px 0;border:1px solid #cbd2d8}.meta__project,.meta__order{padding:10px 12px}.meta__order{border-left:1px solid #cbd2d8}.label{display:block;color:#65717a;font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px}.value{font-weight:700}.meta dl{display:grid;grid-template-columns:1fr 1fr;gap:7px 15px;margin:0}.meta dt,.meta dd{margin:0}.section{margin:12px 0}.section h2{margin:0 0 6px;padding-bottom:4px;border-bottom:2px solid #27333d;font-size:11pt;text-transform:uppercase;letter-spacing:.06em}.scope{min-height:42px}.scope p:last-child{margin-bottom:0}.subject{font-size:12pt;font-weight:700;margin:0 0 5px}table{width:100%;border-collapse:collapse;margin-top:7px}th{background:#27333d;color:#fff;font-size:8pt;text-transform:uppercase;letter-spacing:.06em}th,td{padding:6px 8px;border:1px solid #cbd2d8;text-align:left;vertical-align:top}th:first-child,td:first-child{width:42px;text-align:center}th:last-child,td:last-child{width:116px;text-align:right;white-space:nowrap}.total{display:flex;justify-content:flex-end;margin-top:8px}.total div{min-width:320px;border:2px solid #27333d;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:28px;font-size:12.5pt;font-weight:800}.total span{white-space:nowrap}.authorization{background:#f4f6f7;border-left:5px solid #c9202f;padding:9px 12px}.authorization p{margin:0 0 5px}.authorization p:last-child{margin-bottom:0}.signature-section{break-inside:avoid;page-break-inside:avoid;padding-top:3px;min-height:184px}.signature-intro{margin:10px 0 0}.signature-grid{display:grid;grid-template-columns:1.35fr .65fr;gap:25px 36px;margin-top:31px}.signature-line{border-top:1px solid #17202a;padding-top:5px;min-height:35px}.signature-grid .wide{grid-column:1/-1}.footer{display:flex;justify-content:space-between;gap:20px;margin-top:14px;padding-top:7px;border-top:1px solid #cbd2d8;color:#6a747c;font-size:7.5pt}.no-print{margin:0 auto 18px;display:block;padding:9px 16px;border:0;background:#c9202f;color:#fff;font-weight:700;cursor:pointer}@media print{.no-print{display:none}.sheet{max-width:none}.section,table,.authorization,.signature-section{break-inside:avoid;page-break-inside:avoid}}@media screen{body{padding:24px;background:#e9edf0}.sheet{background:#fff;padding:.4in;box-shadow:0 3px 18px #0002}}
  </style></head><body><button class="no-print" onclick="window.print()">Print / Save as PDF</button><main class="sheet">
    <header class="brand"><div class="brand__identity"><div class="brand__logo"><img src="${htmlEscape(logoUrl)}" alt="The Northgate Group logo"></div></div><div class="document-title"><strong>${documentType}</strong><span>${htmlEscape(order.co_number)}</span></div></header>
    <section class="meta"><div class="meta__project"><span class="label">Project</span><div class="value">${htmlEscape(job.job_number || '')}${job.job_number ? ' — ' : ''}${htmlEscape(job.name)}</div>${projectAddress ? `<div>${projectAddress}</div>` : ''}</div><div class="meta__order"><dl><div><dt class="label">${documentType}</dt><dd class="value">${htmlEscape(order.co_number)}</dd></div><div><dt class="label">Date Issued</dt><dd>${htmlEscape(issuedDate)}</dd></div><div><dt class="label">Revision</dt><dd>${Number(order.revision_number) ? `Revision ${Number(order.revision_number)}` : 'Original'}</dd></div><div><dt class="label">Status</dt><dd>${htmlEscape(order.status)} · For Client Authorization</dd></div></dl></div></section>
    <section class="section scope"><h2>Change Description</h2><p class="subject">${htmlEscape(form.title)}</p><p>${htmlMultiline(form.description, 'The following change to the project scope is submitted for authorization.')}</p></section>
    <section class="section"><h2>Pricing</h2><table><thead><tr><th>Item</th><th>Description</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="total"><div><span>${documentType} Total</span><span>${money(total)}</span></div></div></section>
    <div class="signature-section"><section class="section"><h2>Authorization</h2><div class="authorization"><p>By signing below, the Client authorizes The Northgate Group One, LLC to proceed with the work described in this ${documentType} and acknowledges the stated adjustment to the project price.</p><p>Unless specifically modified above, the remaining terms of the existing agreement remain unchanged. Any schedule impact will be coordinated with the project team.</p></div></section>
    <p class="signature-intro">The undersigned confirms that they are authorized to approve this ${documentType} on behalf of the Client.</p><section class="signature-grid"><div class="signature-line">Authorized Client Signature</div><div class="signature-line">Date</div><div class="signature-line">Printed Name</div><div class="signature-line">Title</div><div class="signature-line wide">Client / Company</div></section></div>
    <footer class="footer"><span>The Northgate Group One, LLC</span><span>${documentType} ${htmlEscape(order.co_number)} · ${htmlEscape(job.job_number || job.name)}</span></footer>
  </main></body></html>`;
}

export function ChangeOrderWorkspace({ job, initialOrder, budgetLines, permissions, onClose, onChanged }) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const changeOrderBudgetLines = useMemo(
    () => budgetLines.filter(isChangeOrderBudgetLine).sort(compareBudgetLines),
    [budgetLines],
  );
  const remainingBudgetLines = useMemo(
    () => budgetLines.filter((line) => !isChangeOrderBudgetLine(line)).sort(compareBudgetLines),
    [budgetLines],
  );
  const defaultBudgetLine = changeOrderBudgetLines[0] || remainingBudgetLines[0] || null;
  const [order, setOrder] = useState(initialOrder || null);
  const [lines, setLines] = useState([blankLine(defaultBudgetLine)]);
  const [form, setForm] = useState({
    record_type: initialOrder?.record_type || 'change_order',
    status: initialOrder?.status === 'proposed' ? 'potential' : initialOrder?.status || 'draft',
    co_number: initialOrder?.co_number || '',
    title: initialOrder?.title || '',
    description: initialOrder?.description || '',
    change_order_date: initialOrder?.change_order_date || new Date().toISOString().slice(0, 10),
    internal_notes: initialOrder?.internal_notes || '',
    overall_markup_percent: initialOrder?.overall_markup_percent ?? '',
    overall_markup_budget_line_id: '',
    reason: '',
  });
  const [savedOverallMarkupAmount, setSavedOverallMarkupAmount] = useState(0);
  const [verification, setVerification] = useState({ file: null, name: '', certified: false });
  const [action, setAction] = useState({ name: '', error: null, success: '' });

  const isDraft = !order || isEditableAdjustment(order);
  const lineItemsTotal = useMemo(() => editableChangeOrderLines(lines).reduce((sum, line) => sum + lineTotal(line), 0), [lines]);
  const overallMarkupAmount = isDraft
    ? percentMarkupAmount(lineItemsTotal, form.overall_markup_percent) ?? 0
    : savedOverallMarkupAmount;
  const total = isDraft ? (lines.some((line) => lineTotal(line) !== null) ? lineItemsTotal + overallMarkupAmount : null) : order?.price_amount;
  const canCreate = permissions?.canCreateChangeOrders === true;
  const canSubmit = permissions?.canSubmitChangeOrders === true;
  const canVerify = permissions?.canVerifyChangeOrders === true;
  const canApprove = permissions?.canApproveChangeOrders === true;
  const canRevise = permissions?.canReviseChangeOrders === true;
  const canEditDraft = canCreate || Boolean(order?.revision_of_id && canRevise);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!initialOrder?.id) return;
      try {
        const token = await getSupabaseAccessToken(getToken);
        const client = createSupabaseClient(token);
        const { data, error } = await client.from('change_order_lines').select('*').eq('change_order_id', initialOrder.id).order('sort_order');
        if (error) throw error;
        // Existing dollar markup remains authoritative; never infer a historical rate.
        if (mounted) {
          const overallLine = (data || []).find((line) => line.is_overall_markup);
          setSavedOverallMarkupAmount(Number(overallLine?.markup_amount) || 0);
          setForm((current) => ({ ...current, overall_markup_budget_line_id: overallLine?.job_budget_line_id || '' }));
          setLines(editableChangeOrderLines(data).map((line) => ({ ...line, key: line.id, markup_mode: line.markup_percent == null && line.markup_amount != null ? 'legacy' : 'percent', markup_percent: line.markup_percent ?? '' })));
        }
      } catch (error) {
        if (mounted) setAction({ name: '', error, success: '' });
      }
    }
    load();
    return () => { mounted = false; };
  }, [getToken, initialOrder?.id]);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setAction((current) => ({ ...current, error: null, success: '' }));
  }

  function updateLine(key, field, value) {
    setLines((current) => current.map((line) => line.key === key ? withUpdatedLineMarkup(line, { [field]: value, ...(field === 'markup_percent' ? { markup_requires_input: false } : {}) }) : line));
  }

  function duplicateLine(line) {
    setLines((current) => [...current, { ...line, id: undefined, key: crypto.randomUUID(), sort_order: current.length }]);
  }

  async function client() {
    const token = await getSupabaseAccessToken(getToken);
    return createSupabaseClient(token);
  }

  async function saveDraft() {
    if (!canEditDraft || action.name) return null;
    const meaningfulLines = serializeAdjustmentLines(lines);
    if (lines.some((line) => line.markup_requires_input) ||
        lines.some((line) => line.markup_mode === 'percent' && percentMarkupAmount(lineSubtotal(line), line.markup_percent) === null) ||
        percentMarkupAmount(lineItemsTotal, form.overall_markup_percent) === null ||
        meaningfulLines.some((line) => MONEY_FIELDS.some((field) => line[field] !== null && !Number.isFinite(Number(line[field]))))) {
      setAction({ name: '', error: new Error('Enter valid amounts and non-negative markup percentages. Blank amounts can remain blank in a draft.'), success: '' });
      return null;
    }
    const overallRate = Number(form.overall_markup_percent || 0);
    setAction({ name: 'save', error: null, success: '' });
    try {
      const db = await client();
      const { data, error } = await db.rpc('save_contract_adjustment', { p_data: {
        id: order?.id || null, job_id: job.id, record_type: form.record_type,
        status: form.status, expected_updated_at: order?.updated_at || null,
        co_number: form.co_number.trim(), title: form.title.trim(),
        description: form.description, change_order_date: form.change_order_date,
        internal_notes: form.internal_notes, lines: meaningfulLines,
        note: form.reason, overall_markup_percent: overallRate,
        overall_markup_budget_line_id: overallRate > 0 ? form.overall_markup_budget_line_id || null : null,
      } });
      if (error) throw error;
      setOrder(data);
      setForm((current) => ({ ...current, co_number: data.co_number, status: data.status }));
      setSavedOverallMarkupAmount(overallRate > 0 ? percentMarkupAmount(lineItemsTotal, overallRate) ?? 0 : 0);
      // Keep the reopening reason through the next draft save so users do not
      // have to type the same explanation twice for one controlled edit.
      setAction({ name: '', error: null, success: 'Adjustment saved. Incomplete information is preserved.' });
      onChanged?.();
      return data;
    } catch (error) {
      setAction({ name: '', error, success: '' });
      return null;
    }
  }

  async function changeStatus(status) {
    if (action.name || (status === 'submitted' ? !canSubmit : !canApprove)) return;
    if (status === 'approved' && !window.confirm('Approve this contract adjustment and post its signed amounts to Financials? You confirm authority to proceed. Signed documentation can be attached later and is required for closeout.')) return;
    const target = isDraft && canEditDraft ? await saveDraft() : order;
    if (!target) return;
    setAction({ name: status, error: null, success: '' });
    try {
      const db = await client();
      const { data, error } = await db.rpc('set_contract_adjustment_status', {
        p_id: target.id, p_status: status, p_note: form.reason,
        p_expected_updated_at: target.updated_at,
      });
      if (error) throw error;
      setOrder(data);
      setForm((current) => ({ ...current, status: data.status }));
      setAction({ name: '', error: null, success: status === 'approved' ? 'Approved and posted to Changes. Original Budget is unchanged.' : 'Status updated and audited.' });
      onChanged?.();
    } catch (error) { setAction({ name: '', error, success: '' }); }
  }

  async function exportPdf() {
    if (!order?.id || order.archived_at || action.name) return;
    const popup = window.open('about:blank', `change-order-${order.id}`);
    if (!popup) {
      setAction({ name: '', error: new Error('Allow pop-ups to open the printable Change Order PDF.'), success: '' });
      return;
    }
    popup.document.write('<!doctype html><html><head><title>Preparing Change Order…</title></head><body style="font-family:Arial,sans-serif;padding:32px"><p>Preparing client Change Order form…</p></body></html>');
    popup.document.close();
    const target = isDraft && canEditDraft ? await saveDraft() : order;
    if (!target) { popup.close(); return; }
    setAction({ name: 'export', error: null, success: '' });
    try {
      const db = await client();
      const { error } = await db.rpc('record_job_change_order_export', { p_change_order_id: target.id });
      if (error) throw error;
      popup.document.open();
      const logoUrl = new URL('/northgate-group-logo.jpg', window.location.origin).href;
      popup.document.write(clientChangeOrderHtml({ order, job, form, lines, overallMarkupAmount, total, logoUrl }));
      popup.document.close();
      popup.opener = null;
      setOrder((current) => ({ ...current, exported_at: new Date().toISOString(), exported_by: user?.id }));
      setAction({ name: '', error: null, success: 'Printable client Change Order opened. Choose Save as PDF to download it.' });
      onChanged?.();
    } catch (error) {
      popup.close();
      setAction({ name: '', error, success: '' });
    }
  }

  async function uploadAndVerify() {
    if (!order?.id || !canVerify || action.name) return;
    if (!verification.file) {
      setAction({ name: '', error: new Error('Choose the customer authorization document.'), success: '' });
      return;
    }
    setAction({ name: 'verify', error: null, success: '' });
    const documentId = crypto.randomUUID();
    const storagePath = `documents/job/${job.id}/${documentId}/${sanitizeFileName(verification.file.name)}`;
    let db;
    let metadataInserted = false;
    let storageUploaded = false;
    try {
      db = await client();
      const { error: insertError } = await db.from('documents').insert({
        id: documentId, division: job.division, owner_type: 'job', owner_id: job.id,
        change_order_id: order.id, storage_path: storagePath, file_name: verification.file.name,
        document_type: 'change_orders', description: `Signed authorization for ${order.co_number}`,
        file_size_bytes: verification.file.size, mime_type: verification.file.type || null,
        created_by: user?.id || verification.name.trim(),
      });
      if (insertError) throw insertError;
      metadataInserted = true;
      const { error: uploadError } = await db.storage.from(DOCUMENT_BUCKET).upload(storagePath, verification.file, { upsert: false, contentType: verification.file.type || undefined });
      if (uploadError) throw uploadError;
      storageUploaded = true;
      const { data, error } = await db.rpc('attach_signed_job_change_order_document', {
        p_change_order_id: order.id, p_document_id: documentId,
        p_verification_name: user?.fullName || user?.id || '', p_certified: true,
      });
      if (error) throw error;
      setOrder(data);
      setVerification({ file: null, name: '', certified: false });
      setAction({ name: '', error: null, success: 'Signed document uploaded once, linked to Documents, and employee verification recorded.' });
      onChanged?.();
    } catch (error) {
      // Keep uploaded files on an uncertain response: the server may have attached it.
      // Never delete a potentially committed authorization or another user's upload.
      if (metadataInserted) error.message += storageUploaded
        ? ' The uploaded file is preserved in Documents; refresh to check whether it was attached before retrying.'
        : ' The upload did not finish. Retry with the file; its pending metadata may be reviewed in Documents.';
      setAction({ name: '', error, success: '' });
    }
  }

  async function createRevision() {
    if (!order?.id || !canRevise || action.name) return;
    const reason = window.prompt('Enter the reason for creating a controlled revision.');
    if (!reason?.trim()) return;
    setAction({ name: 'revise', error: null, success: '' });
    try {
      const db = await client();
      const { data, error } = await db.rpc('revise_job_change_order', { p_change_order_id: order.id, p_reason: reason.trim() });
      if (error) throw error;
      setOrder(data);
      setForm((current) => ({ ...current, co_number: data.co_number, status: data.status, record_type: data.record_type, change_order_date: data.change_order_date, reason: '' }));
      setLines((current) => current.map((line, index) => ({ ...line, id: undefined, key: crypto.randomUUID(), sort_order: index })));
      setAction({ name: '', error: null, success: 'Controlled draft revision created. Its approval will post only the financial delta.' });
      onChanged?.();
    } catch (error) { setAction({ name: '', error, success: '' }); }
  }

  async function voidApprovedOrder() {
    if (!order?.id || order.status !== 'approved' || !canRevise || action.name) return;
    const reason = window.prompt(`Void ${order.co_number}? Enter the required business reason. This will preserve the record and reverse its financial postings.`);
    if (!reason?.trim()) return;
    const confirmation = window.prompt(`Type ${order.co_number} exactly to confirm the financial reversal.`);
    if (confirmation !== order.co_number) {
      setAction({ name: '', error: new Error(`Confirmation did not match ${order.co_number}. Nothing was changed.`), success: '' });
      return;
    }
    setAction({ name: 'void', error: null, success: '' });
    try {
      const db = await client();
      const { data, error } = await db.rpc('void_approved_job_change_order', {
        p_change_order_id: order.id,
        p_reason: reason.trim(),
        p_confirmation: confirmation,
      });
      if (error) throw error;
      setOrder(data);
      setAction({ name: '', error: null, success: 'Change Order voided. Equal-and-opposite financial postings were created and the full audit history was retained.' });
      onChanged?.();
    } catch (error) { setAction({ name: '', error, success: '' }); }
  }

  async function archiveEditableOrder() {
    if (!order?.id || ['approved', 'voided'].includes(order.status) || !canApprove || action.name) return;
    if (!window.confirm('Archive this unposted adjustment? Its audit history will be retained.')) return;
    const reason = form.reason || 'Archived from active adjustments.';
    setAction({ name: 'archive', error: null, success: '' });
    try {
      const db = await client();
      const { error } = await db.rpc('archive_job_change_order', { p_change_order_id: order.id, p_reason: reason.trim() });
      if (error) throw error;
      onChanged?.();
      onClose?.();
    } catch (error) { setAction({ name: '', error, success: '' }); }
  }

  const workflow = order?.status === 'approved' ? (order.signed_document_id ? 'Posted · authorization attached' : 'Posted · authorization needed for closeout') : 'Save work at any point. Complete pricing and coding before submission or approval.';

  return (
    <section className="change-order-workspace">
      {order?.id&&<AttachedEstimates jobId={job.id} changeOrderId={order.id} permissions={permissions}/>}
      <div className="change-order-workspace__topbar">
        <button type="button" className="secondary-button" onClick={onClose} disabled={Boolean(action.name)}><ArrowLeft aria-hidden="true" /> Back to Change Orders</button>
        <div className="change-order-workspace__identity">
          <span>{form.record_type === 'credit' ? 'Credit' : 'Change Order'}</span>
          <strong>{form.co_number ? `${form.co_number} — ${form.title || 'Untitled'}` : 'New Change Order'}</strong>
          <small>{workflow}</small>
        </div>
        <StatusBadge status={order?.status || 'draft'}>{order?.status || 'draft'}</StatusBadge>
      </div>
      {order ? <div className="change-order-workspace__actions">
        {order.status === 'approved' && canRevise ? <button type="button" className="secondary-button" onClick={createRevision} disabled={Boolean(action.name)}><Copy aria-hidden="true" /> Create Editable Revision</button> : null}
        {order.status === 'approved' && canRevise ? <button type="button" className="secondary-button secondary-button--danger" onClick={voidApprovedOrder} disabled={Boolean(action.name)}><Ban aria-hidden="true" /> {action.name === 'void' ? 'Voiding & Reversing...' : 'Void Approved Change Order'}</button> : null}
      </div> : null}
      <div className="summary-grid summary-grid--compact">
        <SummaryCard label="Project" value={job.job_number || job.name} detail={job.name} />
        <SummaryCard label="Total" value={money(total)} detail={`${lines.length} breakdown line${lines.length === 1 ? '' : 's'}`} />
      </div>

      <div className="change-order-workspace__panel">
        <div className="change-order-form__heading">
          <div>
            <span>Change details</span>
            <strong>Scope and project information</strong>
          </div>
          <small>Workflow actions are recorded in the audit history.</small>
        </div>
        <div className="change-order-form__grid">
          <label><span>Type</span><select value={form.record_type} onChange={(e) => setField('record_type', e.target.value)} disabled={Boolean(order) || !canEditDraft}><option value="change_order">Change Order (CO)</option><option value="credit">Standalone Credit (CR)</option></select></label>
          <label><span>Change Order number</span><input value={form.co_number} onChange={(e) => setField('co_number', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} placeholder={form.record_type === 'credit' ? 'Auto-number CR-001' : 'Auto-number CO-001'} /></label>
          <label><span>Date</span><input type="date" value={form.change_order_date} onChange={(e) => setField('change_order_date', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /></label>
          <label><span>Current status</span>{isDraft ? <select value={form.status} onChange={(e) => setField('status', e.target.value)} disabled={!canEditDraft || Boolean(action.name)}><option value="draft">Draft</option><option value="potential">Potential</option><option value="submitted" disabled={!canSubmit}>Submitted</option></select> : <input value={order?.status} disabled />}</label>
          <label className="change-order-form__wide"><span>Title</span><input value={form.title} onChange={(e) => setField('title', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /></label>
          <label className="change-order-form__scope"><span>Description / scope</span><textarea rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /></label>
          <label className="change-order-form__notes"><span>Internal notes <small>Not included in client PDF</small></span><textarea rows={3} value={form.internal_notes} onChange={(e) => setField('internal_notes', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /></label>
        </div>
      </div>

      <div className="change-order-workspace__panel">
        <Toolbar eyebrow="Pricing" title="Division / cost breakdown" description="Positive additions, zero-dollar work, and negative credits can share one adjustment. Blank means not priced. Coding and pricing are required only to submit or approve." actions={isDraft && canEditDraft ? <button type="button" className="secondary-button" onClick={() => setLines((current) => [...current, blankLine(defaultBudgetLine, current.length)])}><Plus aria-hidden="true" /> Add Line</button> : null} />
        <div className="change-order-lines">
          {lines.map((line, index) => (
            <details className="change-order-line" key={line.key} open={lines.length === 1 ? true : undefined}>
              <summary className="change-order-line__heading"><strong>Line {index + 1} · {line.description || 'Untitled — incomplete'}</strong><span>{money(lineTotal(line))}</span></summary>
              <div className="change-order-line__grid">
                <label><span>Financial line / cost code <small>{!line.job_budget_line_id ? 'Required to submit' : ''}</small></span><select value={line.job_budget_line_id || ''} onChange={(e) => updateLine(line.key, 'job_budget_line_id', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)}><option value="">Save draft without coding</option>{changeOrderBudgetLines.map((item) => <option key={item.id} value={item.id}>{item.cost_code || 'No code'} — {item.description}</option>)}{changeOrderBudgetLines.length && remainingBudgetLines.length ? <option value="__cost_code_separator__" disabled>--------------------</option> : null}{remainingBudgetLines.map((item) => <option key={item.id} value={item.id}>{item.cost_code || 'No code'} — {item.description}</option>)}</select></label>
                <label><span>Vendor / subcontractor</span><input value={line.vendor_name || ''} onChange={(e) => updateLine(line.key, 'vendor_name', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /></label>
                <label className="change-order-line__wide"><span>Description / scope</span><input value={line.description || ''} onChange={(e) => updateLine(line.key, 'description', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /></label>
                {MONEY_FIELDS.filter((field) => field !== 'markup_amount').map((field) => <label key={field}><span>{field.replace('_amount', '').replace('_', ' ')}</span><input type="number" step="0.01" value={line[field] ?? ''} onChange={(e) => updateLine(line.key, field, e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /></label>)}
                {line.markup_mode === 'legacy' ? <label><span>Legacy markup amount</span><input type="number" step="0.01" value={line.markup_amount ?? ''} onChange={(e) => updateLine(line.key, 'markup_amount', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /><small>Applies only to this line.</small>{isDraft && canEditDraft ? <button type="button" className="secondary-button" onClick={() => { if (window.confirm('Replace this legacy dollar markup with a new percentage? Enter a percentage before saving.')) setLines((current) => current.map((item) => item.key === line.key ? { ...item, markup_mode: 'percent', markup_percent: '', markup_requires_input: true, markup_amount: '' } : item)); }}>Use percentage</button> : null}</label> : <label><span>Line markup %</span><input type="number" min="0" step="any" value={line.markup_percent ?? ''} onChange={(e) => updateLine(line.key, 'markup_percent', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /><small>Applies only to this line. Calculated markup: {money(line.markup_amount)} on {money(lineSubtotal(line))}</small></label>}
              </div>
              {isDraft && canEditDraft ? <div className="change-order-line__actions"><button type="button" className="secondary-button" onClick={() => duplicateLine(line)}><Copy aria-hidden="true" /> Duplicate</button><button type="button" className="secondary-button secondary-button--danger" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} disabled={lines.length === 1}><Trash2 aria-hidden="true" /> Remove</button></div> : null}
            </details>
          ))}
        </div>
        <details className="change-order-overall-markup" open={Number(form.overall_markup_percent) > 0 ? true : undefined}>
          <summary><strong>General Contractor Fee / Overall Markup (optional)</strong></summary>
          <p>Applied to the sum of line totals after each line’s own markup. This is separate from line markup.</p>
          <div className="change-order-line__grid">
            <label><span>Overall markup %</span><input type="number" min="0" step="any" value={form.overall_markup_percent} onChange={(event) => setField('overall_markup_percent', event.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /></label>
            <label><span>Financial line for overall markup</span><select value={form.overall_markup_budget_line_id} onChange={(event) => setField('overall_markup_budget_line_id', event.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)}><option value="">Select financial line</option>{changeOrderBudgetLines.map((item) => <option key={item.id} value={item.id}>{item.cost_code || 'No code'} — {item.description}</option>)}{remainingBudgetLines.map((item) => <option key={item.id} value={item.id}>{item.cost_code || 'No code'} — {item.description}</option>)}</select></label>
            <div><small>Calculated overall markup</small><strong>{money(overallMarkupAmount)}</strong></div>
            <div><small>Final Change Order total</small><strong>{money(total)}</strong></div>
          </div>
        </details>
      </div>

      {isDraft && canApprove ? <section className="change-order-workspace__panel">
        <Toolbar eyebrow="Financial decision" title="Approve, deny or waive" description="Approval posts to Changes without changing Original Budget. Customer authorization may be attached later." />
        <label className="change-order-decision-note"><span>Approval / Decision Note (optional)</span><textarea rows={2} value={form.reason} onChange={(e) => setField('reason', e.target.value)} disabled={Boolean(action.name)} /></label>
        <div className="change-order-workspace__actions">
          <button type="button" className="secondary-button secondary-button--danger" onClick={() => changeStatus('denied')} disabled={Boolean(action.name)}>Deny</button>
          <button type="button" className="secondary-button" onClick={() => changeStatus('waived')} disabled={Boolean(action.name)}>Waive</button>
          <button type="button" className="primary-button" onClick={() => changeStatus('approved')} disabled={Boolean(action.name)}><ShieldCheck aria-hidden="true" /> Approve &amp; post to Financials</button>
        </div>
      </section> : null}
      {order?.id ? <details className="change-order-workspace__panel">
        <summary><strong>Documents &amp; client PDF</strong> · {order.signed_document_id ? 'Authorization attached' : 'Authorization not attached'}</summary>
        <p>Attach the signed Change Order or written customer authorization directly here. Required before project closeout, not before approval. The authenticated user and time are recorded automatically.</p>
        <div className="change-order-workspace__actions"><button type="button" className="secondary-button" onClick={exportPdf} disabled={Boolean(action.name)}><Download aria-hidden="true" /> Preview client PDF</button></div>
        {canVerify ? <div className="change-order-verification">
          <label><span>Customer authorization (PDF or image)</span><input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(e) => setVerification((current) => ({ ...current, file: e.target.files?.[0] || null }))} disabled={Boolean(action.name)} /></label>
          <button type="button" className="primary-button" onClick={uploadAndVerify} disabled={Boolean(action.name) || !verification.file}><FileCheck2 aria-hidden="true" /> Attach authorization</button>
        </div> : null}
      </details> : null}
      {order?.id && !['approved', 'voided'].includes(order.status) && canApprove ? <details className="change-order-workspace__panel">
        <summary>Administrative actions</summary>
        <div className="change-order-workspace__actions">
          {['denied', 'waived', 'rejected'].includes(order.status) ? <button className="secondary-button" type="button" disabled={Boolean(action.name)} onClick={() => changeStatus('draft')}>Reopen draft</button> : null}
          <button className="secondary-button secondary-button--danger" type="button" onClick={archiveEditableOrder} disabled={Boolean(action.name)}><Archive aria-hidden="true" /> Archive</button>
        </div>
      </details> : null}

      {order?.id ? <details className="change-order-workspace__panel">
        <summary>Record history</summary>
        <p>Last saved: {formatDate(order.updated_at)} · {order.updated_by || 'Recorded by the system'}</p>
        {order.approved_at ? <p>Approved: {formatDate(order.approved_at)} · {order.decision_name || order.approved_by}</p> : null}
        {order.verified_at ? <p>Authorization attached: {formatDate(order.verified_at)} · {order.verification_name || order.verified_by}</p> : null}
        <p>The complete before/after audit remains in the Job History.</p>
      </details> : null}
      {action.error ? <StatePanel tone="danger" eyebrow="Action Failed" title="Action could not be completed" description={action.error.message || 'Unexpected Change Order error.'} compact /> : null}
      {action.success ? <StatePanel tone="success" eyebrow="Complete" title="Workflow updated" description={action.success} compact /> : null}
      <div className="change-order-workspace__actions">
        {isDraft && canEditDraft ? <button type="button" className="secondary-button" onClick={() => saveDraft()} disabled={Boolean(action.name)}><Save aria-hidden="true" /> {action.name === 'save' ? 'Saving...' : form.status === 'draft' ? 'Save Draft' : 'Save Changes'}</button> : null}
        {isDraft && canSubmit ? <button type="button" className="primary-button" onClick={() => changeStatus('submitted')} disabled={Boolean(action.name)}><Send aria-hidden="true" /> {action.name === 'submit' ? 'Submitting...' : 'Submit Change Order'}</button> : null}
      </div>
    </section>
  );
}
