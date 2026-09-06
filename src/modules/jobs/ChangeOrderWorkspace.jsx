import { useAuth, useUser } from '@clerk/clerk-react';
import { Archive, ArrowLeft, Ban, Copy, Download, FileCheck2, Plus, Save, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { createSupabaseClient } from '../../services/supabaseClient.js';

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
    sort_order: sortOrder,
  };
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function lineTotal(line) {
  return MONEY_FIELDS.reduce((total, field) => total + numberValue(line[field]), 0);
}

function money(value) {
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

function clientChangeOrderHtml({ order, job, form, lines, total, logoUrl }) {
  const projectAddress = [job.address_line1, job.address_line2, [job.city, job.state, job.postal_code].filter(Boolean).join(', ')]
    .filter(Boolean).join('<br>');
  const rows = lines.map((line, index) => `<tr><td>${index + 1}</td><td>${htmlMultiline(line.description, 'Change Order item')}</td><td>${money(lineTotal(line))}</td></tr>`).join('');
  const issuedDate = form.change_order_date ? new Date(`${form.change_order_date}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(order.co_number)} Change Order</title><style>
    @page{size:letter;margin:.4in}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#17202a;font-size:9.75pt;line-height:1.32;background:#fff}.sheet{max-width:7.7in;margin:0 auto}.brand{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:5px solid #c9202f;padding:0 0 8px}.brand__identity{width:330px}.brand__logo{width:310px;height:76px;display:flex;align-items:center}.brand__logo img{display:block;width:100%;height:100%;object-fit:contain;object-position:left center}.document-title{text-align:right}.document-title strong{display:block;font-size:18pt;text-transform:uppercase}.document-title span{color:#c9202f;font-size:11.5pt;font-weight:700}.meta{display:grid;grid-template-columns:1.25fr .75fr;margin:13px 0;border:1px solid #cbd2d8}.meta__project,.meta__order{padding:10px 12px}.meta__order{border-left:1px solid #cbd2d8}.label{display:block;color:#65717a;font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px}.value{font-weight:700}.meta dl{display:grid;grid-template-columns:1fr 1fr;gap:7px 15px;margin:0}.meta dt,.meta dd{margin:0}.section{margin:12px 0}.section h2{margin:0 0 6px;padding-bottom:4px;border-bottom:2px solid #27333d;font-size:11pt;text-transform:uppercase;letter-spacing:.06em}.scope{min-height:42px}.scope p:last-child{margin-bottom:0}.subject{font-size:12pt;font-weight:700;margin:0 0 5px}table{width:100%;border-collapse:collapse;margin-top:7px}th{background:#27333d;color:#fff;font-size:8pt;text-transform:uppercase;letter-spacing:.06em}th,td{padding:6px 8px;border:1px solid #cbd2d8;text-align:left;vertical-align:top}th:first-child,td:first-child{width:42px;text-align:center}th:last-child,td:last-child{width:116px;text-align:right;white-space:nowrap}.total{display:flex;justify-content:flex-end;margin-top:8px}.total div{min-width:320px;border:2px solid #27333d;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:28px;font-size:12.5pt;font-weight:800}.total span{white-space:nowrap}.authorization{background:#f4f6f7;border-left:5px solid #c9202f;padding:9px 12px}.authorization p{margin:0 0 5px}.authorization p:last-child{margin-bottom:0}.signature-section{break-inside:avoid;page-break-inside:avoid;padding-top:3px;min-height:184px}.signature-intro{margin:10px 0 0}.signature-grid{display:grid;grid-template-columns:1.35fr .65fr;gap:25px 36px;margin-top:31px}.signature-line{border-top:1px solid #17202a;padding-top:5px;min-height:35px}.signature-grid .wide{grid-column:1/-1}.footer{display:flex;justify-content:space-between;gap:20px;margin-top:14px;padding-top:7px;border-top:1px solid #cbd2d8;color:#6a747c;font-size:7.5pt}.no-print{margin:0 auto 18px;display:block;padding:9px 16px;border:0;background:#c9202f;color:#fff;font-weight:700;cursor:pointer}@media print{.no-print{display:none}.sheet{max-width:none}.section,table,.authorization,.signature-section{break-inside:avoid;page-break-inside:avoid}}@media screen{body{padding:24px;background:#e9edf0}.sheet{background:#fff;padding:.4in;box-shadow:0 3px 18px #0002}}
  </style></head><body><button class="no-print" onclick="window.print()">Print / Save as PDF</button><main class="sheet">
    <header class="brand"><div class="brand__identity"><div class="brand__logo"><img src="${htmlEscape(logoUrl)}" alt="The Northgate Group logo"></div></div><div class="document-title"><strong>Change Order</strong><span>${htmlEscape(order.co_number)}</span></div></header>
    <section class="meta"><div class="meta__project"><span class="label">Project</span><div class="value">${htmlEscape(job.job_number || '')}${job.job_number ? ' — ' : ''}${htmlEscape(job.name)}</div>${projectAddress ? `<div>${projectAddress}</div>` : ''}</div><div class="meta__order"><dl><div><dt class="label">Change Order</dt><dd class="value">${htmlEscape(order.co_number)}</dd></div><div><dt class="label">Date Issued</dt><dd>${htmlEscape(issuedDate)}</dd></div><div><dt class="label">Revision</dt><dd>${Number(order.revision_number) ? `Revision ${Number(order.revision_number)}` : 'Original'}</dd></div><div><dt class="label">Status</dt><dd>For Client Authorization</dd></div></dl></div></section>
    <section class="section scope"><h2>Change Description</h2><p class="subject">${htmlEscape(form.title)}</p><p>${htmlMultiline(form.description, 'The following change to the project scope is submitted for authorization.')}</p></section>
    <section class="section"><h2>Pricing</h2><table><thead><tr><th>Item</th><th>Description</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="total"><div><span>Change Order Total</span><span>${money(total)}</span></div></div></section>
    <div class="signature-section"><section class="section"><h2>Authorization</h2><div class="authorization"><p>By signing below, the Client authorizes The Northgate Group One, LLC to proceed with the work described in this Change Order and acknowledges the stated adjustment to the project price.</p><p>Unless specifically modified above, the remaining terms of the existing agreement remain unchanged. Any schedule impact will be coordinated with the project team.</p></div></section>
    <p class="signature-intro">The undersigned confirms that they are authorized to approve this Change Order on behalf of the Client.</p><section class="signature-grid"><div class="signature-line">Authorized Client Signature</div><div class="signature-line">Date</div><div class="signature-line">Printed Name</div><div class="signature-line">Title</div><div class="signature-line wide">Client / Company</div></section></div>
    <footer class="footer"><span>The Northgate Group One, LLC</span><span>Change Order ${htmlEscape(order.co_number)} · ${htmlEscape(job.job_number || job.name)}</span></footer>
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
    co_number: initialOrder?.co_number || '',
    title: initialOrder?.title || '',
    description: initialOrder?.description || '',
    change_order_date: initialOrder?.change_order_date || new Date().toISOString().slice(0, 10),
    internal_notes: initialOrder?.internal_notes || '',
    reason: '',
  });
  const [verification, setVerification] = useState({ file: null, name: '', certified: false });
  const [decision, setDecision] = useState({ name: '', certified: false });
  const [action, setAction] = useState({ name: '', error: null, success: '' });

  const isDraft = !order || order.status === 'draft';
  const total = useMemo(() => lines.reduce((sum, line) => sum + lineTotal(line), 0), [lines]);
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
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client.from('change_order_lines').select('*').eq('change_order_id', initialOrder.id).order('sort_order');
        if (error) throw error;
        if (mounted) setLines((data || []).map((line) => ({ ...line, key: line.id })));
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
    setLines((current) => current.map((line) => line.key === key ? { ...line, [field]: value } : line));
  }

  function duplicateLine(line) {
    setLines((current) => [...current, { ...line, id: undefined, key: crypto.randomUUID(), sort_order: current.length }]);
  }

  async function client() {
    const token = await getToken({ template: 'supabase' });
    return createSupabaseClient(token);
  }

  async function saveDraft() {
    if (!canEditDraft || action.name) return null;
    if (!form.co_number.trim() || !form.title.trim()) {
      setAction({ name: '', error: new Error('Change Order number and title are required.'), success: '' });
      return null;
    }
    const meaningfulLines = lines.filter((line) => line.job_budget_line_id || line.description.trim() || MONEY_FIELDS.some((field) => Number(line[field] || 0) !== 0));
    if (meaningfulLines.some((line) => MONEY_FIELDS.some((field) => !Number.isFinite(Number(line[field] || 0))))) {
      setAction({ name: '', error: new Error('Breakdown amounts must be valid numbers.'), success: '' });
      return null;
    }
    if (meaningfulLines.some((line) => !line.job_budget_line_id || !line.description.trim())) {
      setAction({ name: '', error: new Error('Every breakdown line needs a financial line and description.'), success: '' });
      return null;
    }
    setAction({ name: 'save', error: null, success: '' });
    try {
      const db = await client();
      const { data, error } = await db.rpc('save_job_change_order_draft', {
        p_change_order_id: order?.id || null,
        p_job_id: job.id,
        p_division: job.division,
        p_co_number: form.co_number.trim(),
        p_title: form.title.trim(),
        p_description: form.description.trim() || null,
        p_change_order_date: form.change_order_date,
        p_internal_notes: form.internal_notes.trim() || null,
        p_lines: meaningfulLines.map((line, index) => ({ ...line, sort_order: index, key: undefined, id: undefined })),
        p_reason: form.reason.trim(),
      });
      if (error) throw error;
      setOrder(data);
      // Keep the reopening reason through the next draft save so users do not
      // have to type the same explanation twice for one controlled edit.
      setAction({ name: '', error: null, success: 'Draft saved.' });
      onChanged?.();
      return data;
    } catch (error) {
      setAction({ name: '', error, success: '' });
      return null;
    }
  }

  async function submitOrder() {
    if (!canSubmit || action.name) return;
    let target = order;
    if (canEditDraft) target = await saveDraft();
    if (!target) return;
    setAction({ name: 'submit', error: null, success: '' });
    try {
      const db = await client();
      const { data, error } = await db.rpc('submit_job_change_order', { p_change_order_id: target.id, p_reason: form.reason.trim() || 'Change Order submitted.' });
      if (error) throw error;
      setOrder(data);
      setAction({ name: '', error: null, success: 'Change Order submitted. Client PDF and signed-document steps are now available.' });
      onChanged?.();
    } catch (error) { setAction({ name: '', error, success: '' }); }
  }

  async function exportPdf() {
    if (!order?.id || !['submitted', 'approved'].includes(order.status) || action.name) return;
    const popup = window.open('about:blank', `change-order-${order.id}`);
    if (!popup) {
      setAction({ name: '', error: new Error('Allow pop-ups to open the printable Change Order PDF.'), success: '' });
      return;
    }
    popup.document.write('<!doctype html><html><head><title>Preparing Change Order…</title></head><body style="font-family:Arial,sans-serif;padding:32px"><p>Preparing client Change Order form…</p></body></html>');
    popup.document.close();
    setAction({ name: 'export', error: null, success: '' });
    try {
      const db = await client();
      const { error } = await db.rpc('record_job_change_order_export', { p_change_order_id: order.id });
      if (error) throw error;
      popup.document.open();
      const logoUrl = new URL('/northgate-group-logo.jpg', window.location.origin).href;
      popup.document.write(clientChangeOrderHtml({ order, job, form, lines, total, logoUrl }));
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
    if (!verification.file || !verification.name.trim() || !verification.certified) {
      setAction({ name: '', error: new Error('Choose the signed document, enter your verification name/initials, and certify the review.'), success: '' });
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
      const { data: retiredDocuments, error: retireError } = await db.rpc('retire_unsigned_change_order_documents', {
        p_change_order_id: order.id,
        p_reason: `Replaced by a new signed Change Order upload for ${order.co_number}.`,
      });
      if (retireError) throw retireError;
      const retiredPaths = (retiredDocuments || []).map((item) => item.storage_path).filter(Boolean);
      if (retiredPaths.length) {
        const { error: removeRetiredError } = await db.storage.from(DOCUMENT_BUCKET).remove(retiredPaths);
        if (removeRetiredError && !/object not found/i.test(removeRetiredError.message || '')) throw removeRetiredError;
      }
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
        p_verification_name: verification.name.trim(), p_certified: true,
      });
      if (error) throw error;
      setOrder(data);
      setVerification({ file: null, name: '', certified: false });
      setAction({ name: '', error: null, success: 'Signed document uploaded once, linked to Documents, and employee verification recorded.' });
      onChanged?.();
    } catch (error) {
      if (db && storageUploaded) await db.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
      if (db && metadataInserted) await db.rpc('retire_unsigned_change_order_documents', {
        p_change_order_id: order.id,
        p_reason: 'Signed Change Order upload/verification failed; metadata retired automatically.',
      });
      setAction({ name: '', error, success: '' });
    }
  }

  async function approveOrder() {
    if (!order?.id || !canApprove || action.name) return;
    setAction({ name: 'approve', error: null, success: '' });
    try {
      const db = await client();
      const { data, error } = await db.rpc('approve_job_change_order', {
        p_change_order_id: order.id,
        p_reason: form.reason.trim() || 'Signed Change Order approved.',
        p_decision_name: decision.name.trim(),
        p_certified: decision.certified,
      });
      if (error) throw error;
      setOrder(data);
      setDecision({ name: '', certified: false });
      setAction({ name: '', error: null, success: 'Approved. Immutable financial postings were created in the same transaction.' });
      onChanged?.();
    } catch (error) { setAction({ name: '', error, success: '' }); }
  }

  async function denyOrder() {
    if (!order?.id || order.status !== 'submitted' || !canApprove || action.name) return;
    if (!form.reason.trim() || !decision.name.trim() || !decision.certified) {
      setAction({ name: '', error: new Error('A denial reason, decision name/initials, and certification checkbox are required.'), success: '' });
      return;
    }
    setAction({ name: 'deny', error: null, success: '' });
    try {
      const db = await client();
      const { data, error } = await db.rpc('deny_job_change_order', {
        p_change_order_id: order.id,
        p_reason: form.reason.trim(),
        p_decision_name: decision.name.trim(),
        p_certified: decision.certified,
      });
      if (error) throw error;
      setOrder(data);
      setDecision({ name: '', certified: false });
      setAction({ name: '', error: null, success: 'Change Order explicitly denied. The decision was audited and no financial posting was created.' });
      onChanged?.();
    } catch (error) { setAction({ name: '', error, success: '' }); }
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
      setForm((current) => ({ ...current, co_number: data.co_number, change_order_date: data.change_order_date, reason: '' }));
      setLines((current) => current.map((line, index) => ({ ...line, id: undefined, key: crypto.randomUUID(), sort_order: index })));
      setAction({ name: '', error: null, success: 'Controlled draft revision created. Its approval will post only the financial delta.' });
      onChanged?.();
    } catch (error) { setAction({ name: '', error, success: '' }); }
  }

  async function editSubmittedOrder() {
    if (!order?.id || order.status !== 'submitted' || order.signed_document_id || !canCreate || !canSubmit || action.name) return;
    if (!form.reason.trim()) {
      setAction({ name: '', error: new Error('Enter the reason for returning this submitted Change Order to draft.'), success: '' });
      return;
    }
    setAction({ name: 'reopen', error: null, success: '' });
    try {
      const db = await client();
      const { data, error } = await db.rpc('reopen_submitted_job_change_order', { p_change_order_id: order.id, p_reason: form.reason.trim() });
      if (error) throw error;
      setOrder(data);
      setForm((current) => ({ ...current, reason: '' }));
      setAction({ name: '', error: null, success: 'Change Order returned to draft. You can now edit and resubmit it; the transition was added to the audit trail.' });
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
    if (!order?.id || !['draft', 'submitted'].includes(order.status) || order.signed_document_id || !canCreate || (order.status === 'submitted' && !canSubmit) || action.name) return;
    const reason = window.prompt(`Archive ${order.co_number || 'this Change Order'}? Enter the required audit reason.`);
    if (!reason?.trim()) return;
    setAction({ name: 'archive', error: null, success: '' });
    try {
      const db = await client();
      const { error } = await db.rpc('archive_job_change_order', { p_change_order_id: order.id, p_reason: reason.trim() });
      if (error) throw error;
      onChanged?.();
      onClose?.();
    } catch (error) { setAction({ name: '', error, success: '' }); }
  }

  const workflow = order?.status === 'voided' ? 'Voided — financial impact reversed' : order?.status === 'denied' ? 'Denied — no financial impact' : order?.status === 'approved' ? 'Approved' : order?.verified_at ? 'Verified — ready to approve or deny' : order?.signed_document_id ? 'Signed document attached' : order?.exported_at ? 'PDF exported — awaiting client decision' : order?.status === 'submitted' ? 'Submitted — awaiting client decision' : 'Draft — complete and submit';

  return (
    <section className="change-order-workspace">
      <div className="change-order-workspace__topbar">
        <button type="button" className="secondary-button" onClick={onClose} disabled={Boolean(action.name)}><ArrowLeft aria-hidden="true" /> Back to Change Orders</button>
        <div className="change-order-workspace__identity">
          <span>Change Order</span>
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
        <SummaryCard label="Status" value={order?.status || 'draft'} detail={workflow} />
        <SummaryCard label="Total" value={money(total)} detail={`${lines.length} breakdown line${lines.length === 1 ? '' : 's'}`} />
        <SummaryCard label="Last modified" value={formatDate(order?.updated_at)} detail={order?.updated_by || 'Not saved'} />
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
          <label><span>Project</span><input value={`${job.job_number || ''} ${job.name}`.trim()} disabled /></label>
          <label><span>Change Order number</span><input value={form.co_number} onChange={(e) => setField('co_number', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} placeholder="CO-001" /></label>
          <label><span>Date</span><input type="date" value={form.change_order_date} onChange={(e) => setField('change_order_date', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /></label>
          <label><span>Status</span><input value={order?.status || 'draft'} disabled /></label>
          <label className="change-order-form__wide"><span>Title</span><input value={form.title} onChange={(e) => setField('title', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /></label>
          <label className="change-order-form__scope"><span>Description / scope</span><textarea rows={5} value={form.description} onChange={(e) => setField('description', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /></label>
          <label className="change-order-form__notes"><span>Internal notes <small>Not included in client PDF</small></span><textarea rows={5} value={form.internal_notes} onChange={(e) => setField('internal_notes', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /></label>
        </div>
      </div>

      <div className="change-order-workspace__panel">
        <Toolbar eyebrow="Pricing" title="Division / cost breakdown" description="Each line maps to an existing project financial line. Client PDF shows only its description and total; internal component costs remain private." actions={isDraft && canEditDraft ? <button type="button" className="secondary-button" onClick={() => setLines((current) => [...current, blankLine(defaultBudgetLine, current.length)])}><Plus aria-hidden="true" /> Add Line</button> : null} />
        <div className="change-order-lines">
          {lines.map((line, index) => (
            <article className="change-order-line" key={line.key}>
              <div className="change-order-line__heading"><strong>Line {index + 1}</strong><span>{money(lineTotal(line))}</span></div>
              <div className="change-order-line__grid">
                <label><span>Financial line / cost code</span><select value={line.job_budget_line_id} onChange={(e) => updateLine(line.key, 'job_budget_line_id', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)}><option value="">Select financial line</option>{changeOrderBudgetLines.map((item) => <option key={item.id} value={item.id}>{item.cost_code || 'No code'} — {item.description}</option>)}{changeOrderBudgetLines.length && remainingBudgetLines.length ? <option value="__cost_code_separator__" disabled>--------------------</option> : null}{remainingBudgetLines.map((item) => <option key={item.id} value={item.id}>{item.cost_code || 'No code'} — {item.description}</option>)}</select></label>
                <label><span>Vendor / subcontractor</span><input value={line.vendor_name || ''} onChange={(e) => updateLine(line.key, 'vendor_name', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /></label>
                <label className="change-order-line__wide"><span>Description / scope</span><input value={line.description || ''} onChange={(e) => updateLine(line.key, 'description', e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /></label>
                {MONEY_FIELDS.map((field) => <label key={field}><span>{field.replace('_amount', '').replace('_', ' ')}</span><input type="number" step="0.01" value={line[field] ?? ''} onChange={(e) => updateLine(line.key, field, e.target.value)} disabled={!isDraft || !canEditDraft || Boolean(action.name)} /></label>)}
              </div>
              {isDraft && canEditDraft ? <div className="change-order-line__actions"><button type="button" className="secondary-button" onClick={() => duplicateLine(line)}><Copy aria-hidden="true" /> Duplicate</button><button type="button" className="secondary-button secondary-button--danger" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} disabled={lines.length === 1}><Trash2 aria-hidden="true" /> Remove</button></div> : null}
            </article>
          ))}
        </div>
      </div>

      {order?.status === 'submitted' ? <div className="change-order-workspace__panel change-order-client-workflow">
        <Toolbar eyebrow="Next step" title="Client authorization and decision" description="Complete each step in order to record the signed client authorization and decision." />
        <section className="change-order-client-workflow__step" aria-labelledby="co-signature-export">
          <div className="change-order-client-workflow__heading"><span>Step 1</span><strong id="co-signature-export">Export for client signature</strong><p>Download the completed Change Order PDF to send to the client.</p></div>
          {canSubmit ? <div className="change-order-client-workflow__action"><button type="button" className="primary-button" onClick={exportPdf} disabled={Boolean(action.name)}><Download aria-hidden="true" /> Export PDF for signature</button></div> : null}
        </section>
        {canVerify ? <section className="change-order-client-workflow__step" aria-labelledby="co-signed-authorization">
          <div className="change-order-client-workflow__heading"><span>Step 2</span><strong id="co-signed-authorization">Upload and verify signed authorization</strong><p>Upload the signed client document, identify the verifier, and certify the review.</p></div>
          <div className="change-order-verification">
            <label><span>Signed document (PDF preferred)</span><input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(e) => setVerification((current) => ({ ...current, file: e.target.files?.[0] || null }))} disabled={action.name} /></label>
            <label><span>Verification name / initials</span><input value={verification.name} onChange={(e) => setVerification((current) => ({ ...current, name: e.target.value }))} disabled={action.name} /></label>
            <label className="change-order-verification__certify"><input type="checkbox" checked={verification.certified} onChange={(e) => setVerification((current) => ({ ...current, certified: e.target.checked }))} disabled={action.name} /><span>I certify that I reviewed the attached document and verified it is the signed client authorization.</span></label>
            <div className="change-order-client-workflow__action"><button type="button" className="primary-button" onClick={uploadAndVerify} disabled={Boolean(action.name) || !verification.file || !verification.name.trim() || !verification.certified}><FileCheck2 aria-hidden="true" /> {action.name === 'verify' ? 'Uploading...' : 'Upload signed authorization'}</button></div>
          </div>
        </section> : null}
        {canApprove ? <section className="change-order-client-workflow__step" aria-labelledby="co-client-decision">
          <div className="change-order-client-workflow__heading"><span>Step 3</span><strong id="co-client-decision">Record the client’s decision</strong><p>Confirm the signer’s decision, then approve or deny the Change Order.</p></div>
          <div className="change-order-verification">
            <label><span>Decision name / initials</span><input value={decision.name} onChange={(e) => setDecision((current) => ({ ...current, name: e.target.value }))} disabled={action.name} /></label>
            <label className="change-order-verification__certify"><input type="checkbox" checked={decision.certified} onChange={(e) => setDecision((current) => ({ ...current, certified: e.target.checked }))} disabled={action.name} /><span>I certify that I reviewed the signed authorization and am recording the client’s decision.</span></label>
            <div className="change-order-client-workflow__decision-actions">
              <label className="change-order-client-workflow__deny-reason"><span>Reason if denying</span><input value={form.reason} onChange={(e) => setField('reason', e.target.value)} disabled={Boolean(action.name)} placeholder="Required only for denial" /></label>
              <button type="button" className="secondary-button secondary-button--danger" onClick={denyOrder} disabled={Boolean(action.name) || !form.reason.trim() || !decision.name.trim() || !decision.certified}><Ban aria-hidden="true" /> {action.name === 'deny' ? 'Recording denial...' : 'Deny Change Order'}</button>
              <button type="button" className="primary-button" onClick={approveOrder} disabled={Boolean(action.name) || !order.verified_at || !decision.name.trim() || !decision.certified}><ShieldCheck aria-hidden="true" /> {action.name === 'approve' ? 'Approving & posting...' : 'Approve & post to Financials'}</button>
            </div>
          </div>
        </section> : null}
        {canCreate && canSubmit && !order.signed_document_id ? <section className="change-order-client-workflow__step change-order-client-workflow__administrative" aria-labelledby="co-administrative-actions">
          <div className="change-order-client-workflow__heading"><span>Administrative actions</span><strong id="co-administrative-actions">Return to draft or archive</strong><p>Use these only when the submitted record needs to be reopened or removed from active work.</p></div>
          <div className="change-order-client-workflow__administrative-actions">
            <label><span>Reason for returning to draft</span><input value={form.reason} onChange={(e) => setField('reason', e.target.value)} disabled={Boolean(action.name)} placeholder="Required to reopen for edits" /></label>
            <button type="button" className="secondary-button" onClick={editSubmittedOrder} disabled={Boolean(action.name) || !form.reason.trim()}><Save aria-hidden="true" /> Return to draft</button>
            <button type="button" className="secondary-button secondary-button--danger" onClick={archiveEditableOrder} disabled={Boolean(action.name)}><Archive aria-hidden="true" /> {action.name === 'archive' ? 'Archiving...' : 'Archive Submitted Change Order'}</button>
          </div>
        </section> : null}
      </div> : null}

      {isDraft ? <div className="change-order-action-reason" role="note" aria-label="Optional draft note">
        <div className="change-order-action-reason__notice">
          <strong>Draft note (optional)</strong>
          <span>Optional context retained with this save.</span>
        </div>
        <label>
          <span>Note (optional)</span>
          <input value={form.reason} onChange={(e) => setField('reason', e.target.value)} disabled={Boolean(action.name)} placeholder="Optional context for this draft" />
        </label>
      </div> : null}

      {action.error ? <StatePanel tone="danger" eyebrow="Action Failed" title="Change Order was not advanced" description={action.error.message || 'Unexpected Change Order error.'} compact /> : null}
      {action.success ? <StatePanel tone="success" eyebrow="Complete" title="Workflow updated" description={action.success} compact /> : null}
      <div className="change-order-workspace__actions">
        {isDraft && canEditDraft ? <button type="button" className="secondary-button" onClick={saveDraft} disabled={Boolean(action.name)}><Save aria-hidden="true" /> {action.name === 'save' ? 'Saving...' : 'Save Draft'}</button> : null}
        {order?.status === 'draft' && !order.signed_document_id && canCreate ? <button type="button" className="secondary-button secondary-button--danger" onClick={archiveEditableOrder} disabled={Boolean(action.name)}><Archive aria-hidden="true" /> {action.name === 'archive' ? 'Archiving...' : 'Archive Draft'}</button> : null}
        {isDraft && canSubmit ? <button type="button" className="primary-button" onClick={submitOrder} disabled={Boolean(action.name) || total === 0}><Send aria-hidden="true" /> {action.name === 'submit' ? 'Submitting...' : 'Submit Change Order'}</button> : null}
      </div>
    </section>
  );
}
