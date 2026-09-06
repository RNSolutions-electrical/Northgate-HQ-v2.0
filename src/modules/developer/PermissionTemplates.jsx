import { useAuth } from '@clerk/clerk-react';
import { Copy, Plus, Save, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { createSupabaseClient } from '../../services/supabaseClient.js';
import './permissionTemplates.css';

export function usePermissionTemplates(enabled) {
  const { getToken } = useAuth();
  const [state, setState] = useState({ templates: [], assignments: {}, isLoading: true, error: null });
  const rpc = useCallback(async (name, params) => {
    const token = await getToken({ template: 'supabase' });
    const { data, error } = await createSupabaseClient(token).rpc(name, params);
    if (error) throw error;
    return data;
  }, [getToken]);
  const reload = useCallback(async () => {
    if (!enabled) return;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const data = await rpc('read_permission_templates');
      setState({ ...data, isLoading: false, error: null });
    } catch (error) {
      setState((s) => ({ ...s, isLoading: false, error }));
    }
  }, [enabled, rpc]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, rpc, reload };
}

function SaveError({ error }) {
  return error ? <StatePanel compact tone="danger" title="Permissions were not saved" description={error.message} /> : null;
}

export function PermissionTemplateEditor({ service, options, onSaved }) {
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [pendingSelection, setPendingSelection] = useState(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const { templates } = service;

  function select(next) {
    if (dirty) { setPendingSelection(next); return; }
    open(next);
  }
  function open(next) {
    setDraft({ ...next, permissions: { ...next.permissions } });
    setDirty(!next.id);
    setError(null);
    setSuccess('');
    setPendingSelection(null);
  }
  function update(patch) {
    setDraft((s) => ({ ...s, ...patch }));
    setDirty(true);
    setError(null);
    setSuccess('');
  }
  async function save(reason) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await service.rpc('save_permission_template', {
        p_id: draft.id || null, p_name: draft.name.trim(), p_permissions: draft.permissions,
        p_expected_version: draft.version || null, p_reason: reason,
      });
      setDraft(saved);
      setDirty(false);
      setConfirmSave(false);
      setSuccess('Template saved. Linked users now inherit these permissions.');
      await service.reload();
      onSaved?.();
    } catch (saveError) { setError(saveError); }
    finally { setSaving(false); }
  }
  const blank = { name: '', permissions: Object.fromEntries(options.map((o) => [o.flag, false])) };

  return (
    <section className="permission-template-editor" aria-label="Permission templates">
      <header className="permission-template-heading">
        <h3>Permission templates</h3>
        <button className="secondary-button" type="button" disabled={saving || service.isLoading || !!service.error}
          onClick={() => select(blank)}><Plus aria-hidden="true" /> Create Template</button>
      </header>
      {service.error ? <StatePanel compact tone="danger" title="Templates could not be loaded" description={service.error.message} /> : null}
      <label className="permission-template-select">
        <span>Template</span>
        <select aria-label="Edit permission template" value={draft?.id || ''} disabled={saving || service.isLoading || !!service.error}
          onChange={(e) => { const next = templates.find((t) => t.id === e.target.value); if (next) select(next); }}>
          <option value="">{service.isLoading ? 'Loading templates...' : draft ? 'New template' : 'Choose a template'}</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.linked_users} users)</option>)}
        </select>
      </label>
      {draft ? <>
        <div className="permission-template-fields">
          <label><span>Template name</span><input aria-label="Template name" value={draft.name} maxLength={100} disabled={saving}
            onChange={(e) => update({ name: e.target.value })} /></label>
          <div className="permission-template-scope">
            {draft.default_role ? `Default: ${draft.default_division} / ${draft.default_role}` : 'Custom template'}
          </div>
        </div>
        <div className="permission-template-groups">
          {[...new Set(options.map((o) => o.group))].map((group) => (
            <fieldset key={group} disabled={saving}><legend>{group}</legend>
              {options.filter((o) => o.group === group).map((option) => (
                <label key={option.flag}><input type="checkbox" checked={draft.permissions[option.flag] === true}
                  onChange={(e) => update({ permissions: { ...draft.permissions, [option.flag]: e.target.checked } })} />
                  <span>{option.label}</span></label>
              ))}
            </fieldset>
          ))}
        </div>
        <footer className="permission-template-actions">
          <button className="primary-button" type="button" disabled={saving || !dirty || !draft.name.trim()}
            onClick={() => { setError(null); setConfirmSave(true); }}><Save aria-hidden="true" /> Save Template</button>
          <button className="secondary-button" type="button" disabled={saving}
            onClick={() => select({ ...draft, id: null, version: null, default_role: null, default_division: null, name: `${draft.name} Copy`.slice(0, 100) })}>
            <Copy aria-hidden="true" /> Duplicate</button>
          <button className="secondary-button" type="button" disabled={saving}
            onClick={() => { setDraft(null); setDirty(false); setError(null); }}><Undo2 aria-hidden="true" /> Cancel</button>
          {dirty ? <span role="status">Unsaved changes</span> : null}
        </footer>
      </> : null}
      {!confirmSave ? <SaveError error={error} /> : null}
      {success ? <p role="status">{success}</p> : null}
      <ConfirmDialog open={confirmSave} title="Save permission template" confirmLabel="Save Template" requireReason
        description={`${draft?.name || 'New template'}: changes apply to linked users; individual overrides remain in effect.`}
        isSubmitting={saving} onCancel={() => setConfirmSave(false)} onConfirm={save}><SaveError error={error} /></ConfirmDialog>
      <ConfirmDialog open={!!pendingSelection} title="Discard unsaved template changes?" confirmLabel="Discard Changes"
        onCancel={() => setPendingSelection(null)} onConfirm={() => open(pendingSelection)} />
    </section>
  );
}

function overrideMap(user) {
  const result = {};
  for (const o of user.active_overrides || []) {
    if (o.permission_flag !== 'can_access_developer') result[o.permission_flag] = (result[o.permission_flag] ?? true) && o.granted;
  }
  return result;
}

export function UserPermissionTemplateEditor({ user, service, options, onSaved }) {
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [expected, setExpected] = useState(null);
  const [open, setOpen] = useState(false);
  const assignment = service.assignments[user.user_id] || null;
  const isDeveloper = user.base_permissions?.can_access_developer === true;

  useEffect(() => {
    if (dirty || saving) return;
    const state = { template_id: assignment, overrides: overrideMap(user) };
    setDraft(state);
    setExpected(state);
  }, [user, assignment, dirty, saving]);

  const template = service.templates.find((t) => draft?.template_id ? t.id === draft.template_id
    : t.default_role === user.role && t.default_division === (user.division || 'Unassigned'));
  const base = template?.permissions || user.base_permissions || {};

  function update(patch) { setDraft((d) => ({ ...d, ...patch })); setDirty(true); setError(null); setSuccess(''); }
  async function save(reason) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await service.rpc('save_user_permission_template', {
        p_user_id: user.user_id, p_template_id: draft.template_id, p_overrides: draft.overrides,
        p_expected_state: expected, p_reason: reason,
      });
      setConfirmSave(false);
      setDirty(false);
      setSuccess('User template and overrides saved.');
      await service.reload();
      onSaved?.();
    } catch (saveError) { setError(saveError); }
    finally { setSaving(false); }
  }
  if (!draft) return null;
  return <section className="user-permission-template" aria-label="User template and overrides">
    <div className="permission-template-fields">
      <label><span>Permission template</span>
        <select aria-label="User permission template" value={draft.template_id || ''} disabled={saving || isDeveloper || service.isLoading || !!service.error}
          onChange={(e) => update({ template_id: e.target.value || null })}>
          <option value="">Role / department default</option>
          {service.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <span className="permission-template-scope">{template?.name || 'Role / department default'}</span>
    </div>
    {isDeveloper ? <p>Developer access is controlled by the user profile.</p> : null}
    <button className="secondary-button" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? 'Close Permissions' : 'Open Permissions'}
    </button>
    {open ? <div className="developer-permission-matrix table-wrap">
      <table className="data-table data-table--dense"><thead><tr>
        <th scope="col">Permission</th><th scope="col">Template</th><th scope="col">Grant</th><th scope="col">Deny</th><th scope="col">Effective</th>
      </tr></thead><tbody>{options.map((option) => {
        const overridden = Object.hasOwn(draft.overrides, option.flag);
        const state = overridden ? (draft.overrides[option.flag] ? 'grant' : 'deny') : 'default';
        const effective = overridden ? draft.overrides[option.flag] : base[option.flag] === true;
        return <tr key={option.flag}>
          <td data-label="Permission"><strong>{option.label}</strong><small className="permission-template-area">{option.group}</small></td>
          {['default', 'grant', 'deny'].map((value) => <td className="data-table__cell--center" data-label={value === 'default' ? 'Template' : value} key={value}>
            <input type="radio" name={`${user.user_id}:${option.flag}`} aria-label={`${option.label} ${value}`} checked={state === value}
              disabled={saving || isDeveloper || service.isLoading || !!service.error} onChange={() => {
                const overrides = { ...draft.overrides };
                if (value === 'default') delete overrides[option.flag]; else overrides[option.flag] = value === 'grant';
                update({ overrides });
              }} />
          </td>)}
          <td data-label="Effective">{effective ? 'Granted' : 'Denied'}{overridden ? ' (override)' : ''}</td>
        </tr>;
      })}</tbody></table>
    </div> : null}
    <footer className="permission-template-actions">
      <button className="primary-button" type="button" disabled={!dirty || saving || isDeveloper || service.isLoading || !!service.error}
        onClick={() => { setError(null); setConfirmSave(true); }}><Save aria-hidden="true" /> Save User Permissions</button>
      {dirty ? <button className="secondary-button" type="button" disabled={saving} onClick={() => { setDirty(false); setError(null); }}>
        <Undo2 aria-hidden="true" /> Cancel</button> : null}
    </footer>
    {!confirmSave ? <SaveError error={error} /> : null}
    {success ? <p role="status">{success}</p> : null}
    <ConfirmDialog open={confirmSave} title="Save user permissions" requireReason confirmLabel="Save Permissions" isSubmitting={saving}
      onCancel={() => setConfirmSave(false)} onConfirm={save}><SaveError error={error} /></ConfirmDialog>
  </section>;
}
