import { useAuth } from '@clerk/clerk-react';
import { useEffect, useId, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, RotateCcw } from 'lucide-react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { createSupabaseClient } from '../../services/supabaseClient.js';
import { JOB_DOCUMENT_CATEGORIES, documentCategoryLabel } from './documentCategories.js';
import './documentMaintenance.css';

export function DocumentEditControl({ document: row, ownerType, ownerId, onChanged, disabled }) {
  const { getToken } = useAuth();
  const fieldId = useId();
  const [stage, setStage] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (row.change_order_id || row.owner_type !== ownerType) return null;

  async function save(reason) {
    setBusy(true); setError('');
    try {
      const client = createSupabaseClient(await getToken({ template: 'supabase' }));
      const { error: failure } = await client.rpc('maintain_owner_document', {
        p_document_id: row.id, p_owner_type: ownerType, p_owner_id: ownerId,
        p_action: 'edit', p_changes: draft.changes, p_reason: reason,
        p_expected_updated_at: draft.updatedAt,
      });
      if (failure) throw failure;
      setStage(null); onChanged();
    } catch (failure) { setError(failure.message || 'Document could not be saved.'); }
    finally { setBusy(false); }
  }

  return <>
    <button type="button" className="secondary-button" title="Edit document details" aria-label={`Edit document ${row.file_name}`} disabled={disabled}
      onClick={() => { setDraft({ changes: { file_name: row.file_name, document_type: row.document_type, description: row.description || '' }, updatedAt: row.updated_at }); setError(''); setStage('edit'); }}><Pencil size={16} /></button>
    <ConfirmDialog open={stage !== null} title={stage === 'reason' ? 'Save document changes' : 'Edit document details'}
      confirmLabel={stage === 'reason' ? 'Save document' : 'Save changes'} cancelLabel={stage === 'reason' ? 'Back' : 'Cancel'}
      requireReason={stage === 'reason'} isSubmitting={busy} onCancel={() => setStage(stage === 'reason' ? 'edit' : null)}
      onConfirm={(reason) => { if (stage === 'reason') { save(reason); return; } if (!draft.changes.file_name.trim()) { setError('Enter a filename.'); return; } setError(''); setStage('reason'); }}>
      {draft && stage === 'edit' ? <div className="document-maintenance-fields">
        <label>Filename<input type="text" maxLength={255} value={draft.changes.file_name} onChange={(e) => setDraft({ ...draft, changes: { ...draft.changes, file_name: e.target.value } })} /></label>
        <label htmlFor={`${fieldId}-category`}>Category</label><select id={`${fieldId}-category`} value={draft.changes.document_type} onChange={(e) => setDraft({ ...draft, changes: { ...draft.changes, document_type: e.target.value } })}>
          {JOB_DOCUMENT_CATEGORIES.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
        </select>
        <label>Description<textarea rows={3} maxLength={10000} value={draft.changes.description} onChange={(e) => setDraft({ ...draft, changes: { ...draft.changes, description: e.target.value } })} /></label>
      </div> : null}
      {error ? <p role="alert">{error}</p> : null}
    </ConfirmDialog>
  </>;
}

export function ArchivedDocuments({ ownerType, ownerId, refreshKey, onChanged }) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setLoading(true); setError(''); setRows([]);
    (async () => {
      try {
        const client = createSupabaseClient(await getToken({ template: 'supabase' }));
        const { data, error: failure } = await client.rpc('read_archived_owner_documents', { p_owner_type: ownerType, p_owner_id: ownerId, p_offset: offset });
        if (failure) throw failure;
        if (active) setRows(data || []);
      } catch (failure) { if (active) setError(failure.message || 'Archived documents could not be loaded.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [open, ownerType, ownerId, offset, version, refreshKey, getToken]);

  async function restore(reason) {
    setBusy(true); setSaveError('');
    try {
      const client = createSupabaseClient(await getToken({ template: 'supabase' }));
      const { error: failure } = await client.rpc('maintain_owner_document', {
        p_document_id: target.id, p_owner_type: ownerType, p_owner_id: ownerId, p_action: 'restore',
        p_changes: {}, p_reason: reason, p_expected_updated_at: target.updated_at,
      });
      if (failure) throw failure;
      setTarget(null); setVersion((value) => value + 1); onChanged();
    } catch (failure) { setSaveError(failure.message || 'Document could not be restored.'); }
    finally { setBusy(false); }
  }

  return <section className="document-archive-section" aria-label="Archived documents">
    <button type="button" className="secondary-button" aria-expanded={open} onClick={() => setOpen(!open)}>Archived documents</button>
    {open ? <>
      {loading ? <p role="status">Loading archived documents...</p> : null}
      {error ? <p role="alert">{error} <button type="button" className="secondary-button" onClick={() => setVersion((value) => value + 1)}>Retry</button></p> : null}
      {!loading && !error && !rows.length ? <p>No archived documents on this page.</p> : null}
      {rows.map((row) => <div className="document-archive-row" key={row.id}>
        <div><strong>{row.file_name}</strong><p>{documentCategoryLabel(row.document_type)} &middot; {new Date(row.archived_at).toLocaleDateString()}</p><p>{row.archive_reason}</p></div>
        <button type="button" className="secondary-button" title="Restore document" aria-label={`Restore ${row.file_name}`} onClick={() => { setTarget(row); setSaveError(''); }}><RotateCcw size={16} /></button>
      </div>)}
      <div className="job-document-actions">
        <button type="button" className="secondary-button" title="Previous archived documents" aria-label="Previous archived documents" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}><ChevronLeft size={16} /></button>
        <span>Page {offset / 50 + 1}</span>
        <button type="button" className="secondary-button" title="Next archived documents" aria-label="Next archived documents" disabled={loading || rows.length < 50} onClick={() => setOffset(offset + 50)}><ChevronRight size={16} /></button>
      </div>
    </> : null}
    <ConfirmDialog open={Boolean(target)} title={`Restore ${target?.file_name || 'document'}`} confirmLabel="Restore document" requireReason isSubmitting={busy} onCancel={() => setTarget(null)} onConfirm={restore}>
      {saveError ? <p role="alert">{saveError}</p> : null}
    </ConfirmDialog>
  </section>;
}
