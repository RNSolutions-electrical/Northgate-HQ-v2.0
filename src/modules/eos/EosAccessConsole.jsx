import { useAuth } from '@clerk/clerk-react';
import { useCallback, useEffect, useState } from 'react';
import { withSupabaseTokenRetry } from '../../services/supabaseClient.js';

/** Selected Manager/Director access, separate from technical Developer rank. */
export function EosAccessConsole() {
  const { getToken } = useAuth();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    try {
      const data = await withSupabaseTokenRetry(getToken, async (client) => {
        const response = await client.rpc('read_eos_access_directory');
        if (response.error) throw response.error;
        return response.data || [];
      });
      setRows(data); setError('');
    } catch (cause) { setError(cause.message || 'EOS access could not be loaded.'); }
  }, [getToken]);
  useEffect(() => { load(); }, [load]);

  async function toggle(row) {
    setBusy(row.user_id); setError('');
    try {
      await withSupabaseTokenRetry(getToken, async (client) => {
        const response = await client.rpc('set_eos_access', {
          p_user_id: row.user_id, p_enabled: !row.granted,
        });
        if (response.error) throw response.error;
      });
      await load();
      window.dispatchEvent(new Event('northgate:permissions-updated'));
    } catch (cause) { setError(cause.message || 'EOS access could not be updated.'); }
    finally { setBusy(''); }
  }
  return <article className="developer-console-section" aria-label="E.O.S access">
    <div className="eos-panel-heading"><div><p className="eyebrow">SELECTED MANAGEMENT ACCESS</p><h3>E.O.S access</h3>
      <p>Only explicitly granted Manager or Director profiles can enter E.O.S. Technical Developer access alone does not qualify.</p></div>
      <button type="button" className="secondary-button" onClick={load}>Refresh</button></div>
    {error && <p role="alert" className="alert">{error}</p>}
    {rows.map((row) => <div key={row.user_id} className="eos-reminder-row">
      <span><strong>{row.display_name || row.email || row.user_id}</strong> · {row.business_role}
        <small> · {row.email || 'No email'} · {row.granted ? 'Granted' : 'Not granted'}</small></span>
      <button type="button" className="secondary-button" disabled={busy === row.user_id}
        onClick={() => toggle(row)}>{row.granted ? 'Remove E.O.S access' : 'Grant E.O.S access'}</button>
    </div>)}
    {!rows.length && !error && <p>No eligible Manager or Director profiles were returned.</p>}
  </article>;
}
