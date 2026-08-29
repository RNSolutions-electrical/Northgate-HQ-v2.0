import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { createSupabaseClient } from '../../services/supabaseClient.js';
import { PAY_APP_TEMPLATE_OPTIONS } from './billingPayAppTemplates.js';

export function BillingActions({ jobId, canManage, onComplete }) {
  const { getToken } = useAuth();
  const [template, setTemplate] = useState('aia_g702_g703');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const call = async (name, args) => {
    setWorking(true); setMessage('');
    try {
      const token = await getToken({ template: 'supabase' });
      const { error } = await createSupabaseClient(token).rpc(name, args);
      if (error) throw error;
      setMessage('Saved. Refresh Billing to view the updated authoritative record.');
      onComplete?.();
    } catch (error) { setMessage(error.message || 'Billing action failed.'); }
    finally { setWorking(false); }
  };
  if (!canManage) return <p className="muted-copy">Billing is read-only for your role. Drafts, history, and amounts are protected server-side.</p>;
  return <div className="job-financials-quick-actions">
    <button type="button" className="secondary-button" disabled={working} onClick={() => call('initialize_job_sov_from_financials', { p_job_id: jobId, p_reason: 'Initialize Schedule of Values from Financials' })}>Initialize SOV from Financials</button>
    <label><span className="sr-only">Pay App template</span><select value={template} onChange={(event) => setTemplate(event.target.value)} disabled={working}>{PAY_APP_TEMPLATE_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
    <button type="button" className="primary-button" disabled={working} onClick={() => call('create_job_pay_application', { p_job_id: jobId, p_period_end: new Date().toISOString().slice(0, 10), p_template_key: template, p_template_document_id: null })}>{working ? 'Saving...' : 'Create Draft Pay App'}</button>
    {message ? <small>{message}</small> : null}
  </div>;
}
