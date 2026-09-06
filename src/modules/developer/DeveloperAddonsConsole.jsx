import { useAuth } from '@clerk/clerk-react';
import { Puzzle, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { createSupabaseClient } from '../../services/supabaseClient.js';

export function DeveloperAddonsConsole() {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({ isLoading: true, error: null, rows: [] });
  const [selectedUserId, setSelectedUserId] = useState('');
  const [reason, setReason] = useState('');
  const [saveState, setSaveState] = useState({ isSaving: false, error: null, success: '' });

  useEffect(() => {
    let mounted = true;
    async function load() {
      setState((current) => ({ ...current, isLoading: true, error: null }));
      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client.rpc('read_developer_addon_console');
        if (error) throw error;
        if (mounted) setState({ isLoading: false, error: null, rows: data ?? [] });
      } catch (error) {
        console.error('Add-on console failed to load', error);
        if (mounted) setState({ isLoading: false, error, rows: [] });
      }
    }
    load();
    return () => { mounted = false; };
  }, [getToken, refreshKey]);

  const users = useMemo(() => {
    const map = new Map();
    state.rows.forEach((row) => {
      if (!map.has(row.user_id)) map.set(row.user_id, { user_id: row.user_id, display_name: row.display_name, email: row.email, role: row.role, division: row.division, addons: [] });
      map.get(row.user_id).addons.push(row);
    });
    return [...map.values()];
  }, [state.rows]);
  const selected = users.find((user) => user.user_id === selectedUserId) ?? users[0] ?? null;

  async function setAccess(addon, enabled) {
    if (!selected || saveState.isSaving || reason.trim().length < 3) return;
    setSaveState({ isSaving: true, error: null, success: '' });
    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client.rpc('set_user_addon_access', { p_user_id: selected.user_id, p_addon_key: addon.addon_key, p_enabled: enabled, p_reason: reason.trim() });
      if (error) throw error;
      setReason('');
      setSaveState({ isSaving: false, error: null, success: `${addon.addon_label} ${enabled ? 'enabled' : 'disabled'} for ${selected.display_name || selected.email}.` });
      setRefreshKey((current) => current + 1);
    } catch (error) {
      console.error('Add-on access update failed', error);
      setSaveState({ isSaving: false, error, success: '' });
    }
  }

  return (
    <section className="developer-addons developer-console-page">
      <Toolbar descriptionIsDiagnostic eyebrow="Tool Add-Ons" title="User access" description="Enable optional Northgate tools per user. Navigation, route access, database queries, and RLS all use the same server-authoritative assignment." actions={<button type="button" className="secondary-button" onClick={() => setRefreshKey((current) => current + 1)} disabled={state.isLoading}><RefreshCw aria-hidden="true" /> Refresh</button>} />
      {state.error ? <StatePanel tone="danger" title="Add-on access could not be loaded" description={state.error.message} compact /> : null}
      <div className="developer-addons__workspace">
        <div className="developer-addons__users" role="listbox" aria-label="Users">
          {users.map((user) => <button type="button" key={user.user_id} className={selected?.user_id === user.user_id ? 'is-active' : ''} onClick={() => { setSelectedUserId(user.user_id); setReason(''); setSaveState({ isSaving: false, error: null, success: '' }); }}><strong>{user.display_name || user.email || user.user_id}</strong><span>{user.role} · {user.division || 'Unassigned'}</span></button>)}
        </div>
        <div className="developer-addons__detail">
          {selected ? <>
            <header><div><p className="eyebrow">Selected User</p><h3>{selected.display_name || selected.email}</h3><p>{selected.email || selected.user_id}</p></div><StatusBadge tone={selected.role === 'Developer' ? 'good' : 'neutral'}>{selected.role}</StatusBadge></header>
            <label className="developer-addons__reason"><span>Access change reason</span><textarea rows={2} maxLength={500} value={reason} onChange={(event) => { setReason(event.target.value); setSaveState({ isSaving: false, error: null, success: '' }); }} placeholder="Required before enabling or disabling an add-on" /></label>
            <div className="developer-addons__list">
              {selected.addons.map((addon) => <div className="developer-addons__row" key={addon.addon_key}><span className="developer-addons__icon"><Puzzle aria-hidden="true" /></span><div><strong>{addon.addon_label}</strong><span>{addon.addon_category} · {addon.access_reason || 'No individual assignment recorded'}</span></div><StatusBadge tone={addon.enabled || selected.role === 'Developer' ? 'good' : 'neutral'}>{selected.role === 'Developer' ? 'Developer access' : addon.enabled ? 'Enabled' : 'Disabled'}</StatusBadge><button type="button" className={addon.enabled ? 'secondary-button secondary-button--danger' : 'primary-button'} onClick={() => setAccess(addon, !addon.enabled)} disabled={saveState.isSaving || reason.trim().length < 3 || selected.role === 'Developer'}>{addon.enabled ? 'Disable' : 'Enable'}</button></div>)}
            </div>
            {saveState.error ? <StatePanel tone="danger" title="Add-on access was not changed" description={saveState.error.message} compact /> : null}
            {saveState.success ? <StatePanel tone="success" title="Add-on access updated" description={saveState.success} compact /> : null}
          </> : <StatePanel tone="neutral" title="No active users" description="The permission directory did not return an active user." compact />}
        </div>
      </div>
    </section>
  );
}
