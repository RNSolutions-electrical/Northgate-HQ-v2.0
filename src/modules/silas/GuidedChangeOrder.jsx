import { useAuth } from '@clerk/clerk-react';
import { useEffect, useRef, useState } from 'react';
import { getSupabaseAccessToken } from '../../services/clerkToken.js';
import { createSupabaseClient } from '../../services/supabaseClient.js';
import { guidedDraftLines, guidedInternalNotes, guidedMissing, newGuidedChangeOrder, newGuidedItem } from './guidedChangeOrder.mjs';
import './guidedChangeOrder.css';

const SECTIONS = [
  ['overall', 'Overall change', 'Explain what changed and why.'],
  ['items', 'Line items', 'Describe each separate piece of work.'],
  ['review', 'Review draft', 'Check what is complete and what still needs attention.'],
];
const COSTS = [
  ['materialAmount', 'Material', 'Materials are the parts and supplies required for this work.', 'materials'],
  ['laborAmount', 'Labor', 'Labor is the estimated cost of the time required to perform this work.', 'labor'],
  ['equipmentAmount', 'Equipment', 'Equipment includes rentals or special equipment needed for the work.', 'equipment'],
  ['subcontractAmount', 'Subcontract', 'Work performed by an outside trade.', 'subcontract'],
  ['otherAmount', 'Other', 'Additional costs not covered above.', 'other'],
  ['markupAmount', 'Markup', 'The added amount above direct costs.', 'markup'],
];
const EMPTY_BUDGET_LINES = [];

function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
}

function restoredState(order) {
  const saved = order?.guided_state;
  if (saved?.workflow !== 'change_order' || !Array.isArray(saved.items)) return newGuidedChangeOrder();
  return { ...newGuidedChangeOrder(), ...saved, items: saved.items.map((item) => ({ ...newGuidedItem(), ...item, key: item.key || crypto.randomUUID() })) };
}

export function GuidedChangeOrder({ job, initialOrder = null, budgetLines = EMPTY_BUDGET_LINES, permissions, onClose, onOpenDraft, onChanged }) {
  const { getToken } = useAuth();
  const [state, setState] = useState(() => restoredState(initialOrder));
  const [order, setOrder] = useState(initialOrder);
  const [selectedBudgetLines, setSelectedBudgetLines] = useState(budgetLines);
  const [saveStatus, setSaveStatus] = useState(initialOrder?.id ? 'Draft saved' : 'Preparing draft…');
  const [error, setError] = useState('');
  const current = useRef(state);
  const orderId = useRef(initialOrder?.id || null);
  const revision = useRef(initialOrder?.id ? 0 : 1);
  const savedRevision = useRef(0);
  const saving = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    if (budgetLines.length) { setSelectedBudgetLines(budgetLines); return; }
    let active = true;
    async function load() {
      try {
        const token = await getSupabaseAccessToken(getToken);
        const db = createSupabaseClient(token);
        const { data, error: loadError } = await db.from('job_budget_lines').select('id,cost_code,description').eq('job_id', job.id).is('archived_at', null).order('cost_code');
        if (loadError) throw loadError;
        if (active) setSelectedBudgetLines(data || []);
      } catch { /* An uncoded draft is still valid; project financial access is not elevated. */ }
    }
    load();
    return () => { active = false; };
  }, [budgetLines, getToken, job.id]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (!initialOrder?.id) { timer.current = setTimeout(() => { void save(); }, 1100); } return () => { if (timer.current) clearTimeout(timer.current); }; }, []);

  function change(next, { resetReady = true } = {}) {
    const updated = typeof next === 'function' ? next(current.current) : next;
    const value = resetReady ? { ...updated, readyForReview: false } : updated;
    current.current = value;
    revision.current += 1;
    setState(value);
    setError('');
    setSaveStatus('Unsaved changes');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save(); }, 1100);
  }

  async function save() {
    if (timer.current) clearTimeout(timer.current);
    if (saving.current) return saving.current;
    if (savedRevision.current >= revision.current) return orderId.current;
    saving.current = (async () => {
      try {
        while (savedRevision.current < revision.current) {
          const snapshot = current.current;
          const targetRevision = revision.current;
          const lines = guidedDraftLines(snapshot);
          if (lines.some((line) => ['material_amount', 'labor_amount', 'equipment_amount', 'subcontract_amount', 'other_amount', 'markup_amount'].some((key) => !Number.isFinite(line[key])))) throw new Error('Cost amounts must be valid numbers.');
          setSaveStatus('Saving draft…');
          const token = await getSupabaseAccessToken(getToken);
          const db = createSupabaseClient(token);
          const { data, error: saveError } = await db.rpc('save_guided_change_order_draft', {
            p_change_order_id: orderId.current,
            p_job_id: job.id,
            p_division: job.division,
            p_co_number: snapshot.coNumber.trim(),
            p_title: snapshot.title.trim() || 'New Change Order',
            p_description: snapshot.scope.trim() || null,
            p_internal_notes: guidedInternalNotes(snapshot) || null,
            p_lines: lines,
            p_guided_state: snapshot,
          });
          if (saveError) throw saveError;
          orderId.current = data.id;
          current.current = { ...current.current, lastSavedAt: data.updated_at };
          setState(current.current);
          savedRevision.current = targetRevision;
          setOrder(data);
          onChanged?.();
        }
        setSaveStatus('Draft saved');
        return orderId.current;
      } catch (saveError) {
        setError(saveError.message || 'Draft could not be saved.');
        setSaveStatus('Save failed');
        return null;
      } finally { saving.current = null; }
    })();
    return saving.current;
  }

  async function openDraft() {
    const id = await save();
    if (id && onOpenDraft) onOpenDraft({ ...(order || {}), id, job_id: job.id, division: job.division, co_number: current.current.coNumber, title: current.current.title || 'New Change Order', description: current.current.scope, internal_notes: guidedInternalNotes(current.current), status: 'draft', guided_state: current.current });
  }

  async function exit() {
    if (revision.current > savedRevision.current && !(await save())) return;
    onClose?.();
  }

  async function markReady() {
    const missing = guidedMissing(current.current);
    if (missing.length) { setError(`Address ${missing.length} checklist item${missing.length === 1 ? '' : 's'} before marking this ready.`); return; }
    const next = { ...current.current, readyForReview: true, currentSection: 'review' };
    current.current = next;
    revision.current += 1;
    setState(next);
    setSaveStatus('Unsaved changes');
    await save();
  }

  function updateItem(index, key, value) {
    change((previous) => ({ ...previous, items: previous.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
  }

  function updateAddressed(index, key, checked) {
    change((previous) => ({ ...previous, items: previous.items.map((item, itemIndex) => itemIndex === index ? { ...item, addressed: { ...item.addressed, [key]: checked } } : item) }));
  }

  const selected = Math.min(state.selectedItem || 0, state.items.length - 1);
  const item = state.items[selected];
  const missing = guidedMissing(state);
  const total = guidedDraftLines(state).reduce((sum, line) => sum + ['material_amount', 'labor_amount', 'equipment_amount', 'subcontract_amount', 'other_amount', 'markup_amount'].reduce((part, key) => part + line[key], 0), 0);

  if (permissions?.canCreateChangeOrders !== true) return <section className="card guided-co"><h2>Change Order guidance</h2><p>Your current permissions do not allow Change Order drafts. Silas cannot override that permission.</p><button className="secondary-button" type="button" onClick={onClose}>Back</button></section>;

  return <section className="card guided-co" aria-label="Guided Change Order builder">
    <header className="guided-co__header"><div><p className="eyebrow">Silas · Guided workflow</p><h1>Help me build a Change Order</h1><p>We’ll build a real editable draft. Nothing here submits, approves, or posts to Financials.</p><strong>{job.name}</strong></div><div className="guided-co__header-actions"><span role="status">{saveStatus}</span><button type="button" className="secondary-button" onClick={() => void save()} disabled={savedRevision.current >= revision.current}>Save draft</button><button type="button" className="secondary-button" onClick={() => void exit()}>Save &amp; exit</button></div></header>
    {error ? <div className="alert" role="alert">{error} {saveStatus === 'Save failed' ? <button type="button" className="secondary-button" onClick={() => { if (window.confirm('Leave without saving these changes? The existing draft will not be overwritten.')) onClose?.(); }}>Exit without overwriting</button> : null}</div> : null}
    <nav className="guided-co__nav" aria-label="Change Order sections">{SECTIONS.map(([key, label, help]) => <button key={key} type="button" className={state.currentSection === key ? 'guided-co__nav-active' : ''} onClick={() => change((value) => ({ ...value, currentSection: key }), { resetReady: false })}><strong>{label}</strong><small>{help}</small></button>)}</nav>
    {state.currentSection === 'overall' ? <div className="guided-co__body"><h2>What changed?</h2><p>Describe the request or condition in plain language. This becomes the scope on the Change Order.</p><div className="guided-co__fields"><label>Change Order number<input value={state.coNumber} onChange={(event) => change((value) => ({ ...value, coNumber: event.target.value }))} /><small>Replace the temporary DRAFT number before marking ready.</small></label><label>Change title<input value={state.title} onChange={(event) => change((value) => ({ ...value, title: event.target.value }))} placeholder="Additional receptacles" /></label><label className="guided-co__wide">What changed?<textarea rows={5} value={state.scope} onChange={(event) => change((value) => ({ ...value, scope: event.target.value }))} placeholder="The client requested…" /></label><label className="guided-co__wide">Internal notes<textarea rows={3} value={state.internalNotes} onChange={(event) => change((value) => ({ ...value, internalNotes: event.target.value }))} placeholder="For the project team; not on the client form" /></label></div><button type="button" className="primary-button" onClick={() => change((value) => ({ ...value, currentSection: 'items' }))}>Continue to line items</button></div> : null}
    {state.currentSection === 'items' && item ? <div className="guided-co__body"><h2>Build each line item</h2><p>A line item is a separate piece of work on the client Change Order. Add another whenever the scope or pricing should be shown separately.</p><div className="guided-co__item-tabs">{state.items.map((entry, index) => <button key={entry.key} type="button" className={selected === index ? 'guided-co__nav-active' : ''} onClick={() => change((value) => ({ ...value, selectedItem: index }), { resetReady: false })}>Line {index + 1}: {entry.title || 'Untitled'}</button>)}<button type="button" className="secondary-button" onClick={() => change((value) => ({ ...value, items: [...value.items, newGuidedItem()], selectedItem: value.items.length }))}>+ Add line</button></div><div className="guided-co__fields"><label>Line title<input value={item.title} onChange={(event) => updateItem(selected, 'title', event.target.value)} placeholder="Install additional receptacle" /></label><label>Financial line (optional for a draft)<select value={item.financialLineId || ''} onChange={(event) => updateItem(selected, 'financialLineId', event.target.value)}><option value="">Assign before submission</option>{selectedBudgetLines.map((line) => <option key={line.id} value={line.id}>{line.cost_code} — {line.description}</option>)}</select></label><label className="guided-co__wide">Scope of this line<textarea rows={3} value={item.scope} onChange={(event) => updateItem(selected, 'scope', event.target.value)} placeholder="Describe the work included in this line" /></label></div><div className="guided-co__costs">{COSTS.map(([field, label, help, key]) => <div className="guided-co__cost" key={field}><label><strong>{label}</strong><small>{help}</small><input type="number" step="0.01" value={item[field]} onChange={(event) => updateItem(selected, field, event.target.value)} placeholder="0.00" /></label><label className="guided-co__skip"><input type="checkbox" checked={Boolean(item.addressed?.[key])} onChange={(event) => updateAddressed(selected, key, event.target.checked)} /> Not applicable (no cost)</label></div>)}</div><div className="guided-co__fields"><label>Materials / components<textarea rows={2} value={item.materials} onChange={(event) => updateItem(selected, 'materials', event.target.value)} placeholder="List the parts needed" /></label><label>Labor details<textarea rows={2} value={item.labor} onChange={(event) => updateItem(selected, 'labor', event.target.value)} placeholder="Crew and expected hours" /></label><label>Equipment details<textarea rows={2} value={item.equipment} onChange={(event) => updateItem(selected, 'equipment', event.target.value)} placeholder="Lift, rental, special equipment…" /></label><label>Schedule impact<textarea rows={2} value={item.schedule} onChange={(event) => updateItem(selected, 'schedule', event.target.value)} placeholder="None, or describe impact" /></label><label>Access / shutdown<textarea rows={2} value={item.access} onChange={(event) => updateItem(selected, 'access', event.target.value)} placeholder="Required access or shutdown" /></label><label>Clarifications / exclusions<textarea rows={2} value={item.clarifications} onChange={(event) => updateItem(selected, 'clarifications', event.target.value)} placeholder="What is not included?" /></label></div><button type="button" className="primary-button" onClick={() => change((value) => ({ ...value, currentSection: 'review' }), { resetReady: false })}>Review draft</button></div> : null}
    {state.currentSection === 'review' ? <div className="guided-co__body"><h2>Review your Change Order</h2><p><strong>{state.coNumber}</strong> · {state.title || 'Untitled change'} · {money(total)}</p><p>{state.scope || 'Overall scope not entered yet.'}</p><div className="guided-co__review-lines">{state.items.map((entry, index) => <article key={entry.key}><strong>Line {index + 1} — {entry.title || 'Untitled'}</strong><p>{entry.scope || 'Scope still needed.'}</p><small>Material {money(entry.materialAmount)} · Labor {money(entry.laborAmount)} · Equipment {money(entry.equipmentAmount)}</small><button type="button" className="secondary-button" onClick={() => change((value) => ({ ...value, currentSection: 'items', selectedItem: index }))}>Edit line</button></article>)}</div><h3>{missing.length ? `${missing.length} items need attention` : 'Ready for review'}</h3>{missing.length ? <ul>{missing.map((text) => <li key={text}>{text}</li>)}</ul> : <p>All expected sections are addressed. This is still a draft and has not been submitted.</p>}<div className="guided-co__actions"><button type="button" className="secondary-button" onClick={() => void save()}>Save draft</button><button type="button" className="primary-button" disabled={Boolean(missing.length)} onClick={() => void markReady()}>{state.readyForReview ? 'Ready for Review ✓' : 'Mark Ready for Review'}</button><button type="button" className="secondary-button" onClick={() => void openDraft()}>Open editable Change Order</button></div></div> : null}
  </section>;
}
