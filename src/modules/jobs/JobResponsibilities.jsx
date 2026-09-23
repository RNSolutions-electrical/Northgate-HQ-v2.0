import { useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { createSupabaseClient } from '../../services/supabaseClient.js';
import { StatePanel } from '../../components/ui/StatePanel.jsx';

const SLOTS = [
  ['superintendent', 'Superintendent'],
  ['construction_pm', 'Construction Project Manager'],
  ['electrical_pm', 'Electrical Project Manager'],
  ['electrical_lead', 'Electrical Lead'],
];

export function JobResponsibilities({ jobId, canManage }) {
  const { getToken } = useAuth();
  const [slots, setSlots] = useState([]);
  const [people, setPeople] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const client = createSupabaseClient(await getToken({ template: 'supabase' }));
        const { data, error: readError } = await client.rpc('read_job_responsibilities', { p_job_id: jobId });
        if (readError) throw readError;
        let directory = [];
        if (canManage) {
          const result = await client.rpc('read_job_assignment_directory_v5', { p_job_id: jobId });
          if (result.error) throw result.error;
          directory = result.data || [];
        }
        if (active) { setSlots(data || []); setPeople(directory); setError(null); }
      } catch (failure) { if (active) setError(failure); }
    }
    if (jobId) load();
    return () => { active = false; };
  }, [canManage, getToken, jobId]);

  async function setResponsibility(role, userId) {
    setBusy(role);
    setError(null);
    try {
      const client = createSupabaseClient(await getToken({ template: 'supabase' }));
      const { error: saveError } = await client.rpc('set_job_responsibility', {
        p_job_id: jobId, p_responsibility: role, p_user_id: userId || null,
      });
      if (saveError) throw saveError;
      const person = people.find((row) => row.user_id === userId);
      setSlots((current) => [...current.filter((slot) => slot.responsibility !== role), ...(userId ? [{ responsibility: role, user_id: userId, display_name: person?.display_name, email: person?.email }] : [])]);
    } catch (failure) { setError(failure); }
    finally { setBusy(''); }
  }

  return <section className="job-responsibilities" aria-label="Project responsibilities">
    <div><small className="eyebrow">Project responsibility</small><h3>Who owns what</h3><p>Informational assignments only. Project access and permissions are unchanged.</p></div>
    {error ? <StatePanel tone="danger" title="Responsibilities could not be loaded" description={error.message} compact /> : null}
    <div className="job-responsibilities__grid">{SLOTS.map(([role, label]) => {
      const assignment = slots.find((slot) => slot.responsibility === role);
      const selected = assignment?.user_id || '';
      const person = people.find((row) => row.user_id === selected);
      return <label key={role}><span>{label}</span>{canManage ? <select value={selected} onChange={(event) => setResponsibility(role, event.target.value)} disabled={busy === role} aria-label={label}>
        <option value="">Unassigned</option>
        {people.map((row) => <option key={row.user_id} value={row.user_id}>{row.display_name || row.email || row.user_id}</option>)}
      </select> : <strong>{selected ? assignment?.display_name || assignment?.email || person?.display_name || selected : 'Unassigned'}</strong>}</label>;
    })}</div>
  </section>;
}
