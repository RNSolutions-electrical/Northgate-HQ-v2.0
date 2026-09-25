import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { getSupabaseAccessToken } from '../../services/clerkToken.js';
import { createSupabaseClient } from '../../services/supabaseClient.js';
import { StatePanel } from '../../components/ui/StatePanel.jsx';

export function ContractCloseoutReadiness({ jobId, onOpen }) {
  const { getToken } = useAuth();
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = createSupabaseClient(await getSupabaseAccessToken(getToken));
        const { data, error } = await client.rpc('job_contract_closeout_counts', { p_job_id: jobId });
        if (error) throw error;
        if (active) setState({ loading: false, data, error: null });
      } catch (error) { if (active) setState({ loading: false, data: null, error }); }
    })();
    return () => { active = false; };
  }, [getToken, jobId]);
  return <section className="change-order-workspace__panel">
    <StatePanel compact tone={state.error || !state.data?.ready ? 'warning' : 'success'}
      title="Contract adjustment closeout"
      description={state.loading ? 'Checking required documentation and decisions…' : state.error ? state.error.message : state.data.ready ? 'Contract adjustment requirements are satisfied.' : `${state.data.missing_signed_documents} approved adjustment(s) need signed authorization; ${state.data.unresolved_adjustments} potential/submitted adjustment(s) need a decision. Resolve these before marking the job Complete.`} />
    {onOpen ? <button className="secondary-button" type="button" onClick={onOpen}>Review Change Orders / Credits</button> : null}
  </section>;
}
