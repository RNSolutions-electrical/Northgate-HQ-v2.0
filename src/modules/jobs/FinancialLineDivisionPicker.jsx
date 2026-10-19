import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { getSupabaseAccessToken } from '../../services/clerkToken.js';
import { createSupabaseClient } from '../../services/supabaseClient.js';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import {createFinancialDivisionResolver} from './financialDivisionGroups.js';

export function FinancialLineDivisionPicker({ jobId, onSelect, onClose }) {
  const { getToken } = useAuth();
  const [state, setState] = useState({ loading: true, divisions: [], error: null });
  useEffect(() => {
    let active = true;
    async function load() {
      setState({ loading: true, divisions: [], error: null });
      try {
        const token = await getSupabaseAccessToken(getToken);
        const client=createSupabaseClient(token);
        const { data, error } = await client.from('job_budget_divisions')
          .select('id,code,name,sort_order').eq('job_id', jobId).is('archived_at', null).order('sort_order');
        if (error) throw error;
        const names=await client.rpc('read_job_financial_names',{p_job_id:jobId});
        if(names.error)throw names.error;
        const catalogue=await client.rpc('read_financial_catalogue',{p_include_retired:false});
        if(catalogue.error)throw catalogue.error;
        const byId=new Map((names.data?.divisions||[]).map(row=>[row.id,row]));
        const projectDivisions=(data||[]).map(row=>({...row,_financialName:byId.get(row.id)}));
        const choices=createFinancialDivisionResolver({projectDivisions,catalogueDivisions:catalogue.data?.divisions||[]}).choices();
        if (active) setState({ loading: false, divisions:choices, error: null });
      } catch (error) {
        if (active) setState({ loading: false, divisions: [], error });
      }
    }
    load();
    return () => { active = false; };
  }, [getToken, jobId]);

  return <section className="job-financials-compact-form" aria-label="Choose financial line division">
    <p>Choose the division for the new financial line.</p>
    {state.loading ? <p role="status">Loading project divisions...</p>
      : state.error ? <StatePanel tone="danger" title="Project divisions could not be loaded" description={state.error.message} compact />
        : state.divisions.length ? <div className="job-financials-quick-actions">
          {state.divisions.map((division) => <button key={division.key} type="button" className="secondary-button" onClick={() => onSelect(division)}>
            {division.label}
          </button>)}
        </div> : <StatePanel tone="neutral" title="No active project divisions" description="No active division is available for a new financial line." compact />}
    <button type="button" className="secondary-button" onClick={onClose}>Cancel adding financial line</button>
  </section>;
}
