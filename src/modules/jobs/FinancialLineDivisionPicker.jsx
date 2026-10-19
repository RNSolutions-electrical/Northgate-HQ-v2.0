import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { getSupabaseAccessToken } from '../../services/clerkToken.js';
import { createSupabaseClient } from '../../services/supabaseClient.js';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { financialDivisionLabel } from './financialDivisionLabels.js';

export function FinancialLineDivisionPicker({ jobId, onSelect, onClose }) {
  const { getToken } = useAuth();
  const [state, setState] = useState({ loading: true, divisions: [], error: null });
  useEffect(() => {
    let active = true;
    async function load() {
      setState({ loading: true, divisions: [], error: null });
      try {
        const token = await getSupabaseAccessToken(getToken);
        const { data, error } = await createSupabaseClient(token).from('job_budget_divisions')
          .select('id,code,name,sort_order').eq('job_id', jobId).is('archived_at', null).order('sort_order');
        if (error) throw error;
        if (active) setState({ loading: false, divisions: data || [], error: null });
      } catch (error) {
        if (active) setState({ loading: false, divisions: [], error });
      }
    }
    load();
    return () => { active = false; };
  }, [getToken, jobId]);

  return <section className="job-financials-compact-form" aria-label="Choose financial line division">
    <p>Choose the project division for the new financial line.</p>
    {state.loading ? <p role="status">Loading project divisions...</p>
      : state.error ? <StatePanel tone="danger" title="Project divisions could not be loaded" description={state.error.message} compact />
        : state.divisions.length ? <div className="job-financials-quick-actions">
          {state.divisions.map((division) => <button key={division.id} type="button" className="secondary-button" onClick={() => onSelect(division)}>
            {financialDivisionLabel(division.code, division.name)}
          </button>)}
        </div> : <StatePanel tone="neutral" title="No active project divisions" description="A budget approver can use Build from Template to set up project divisions before adding a financial line." compact />}
    <button type="button" className="secondary-button" onClick={onClose}>Cancel adding financial line</button>
  </section>;
}
