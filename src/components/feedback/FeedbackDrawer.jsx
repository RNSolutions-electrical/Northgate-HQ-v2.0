import { useAuth, useUser } from '@clerk/clerk-react';
import { CheckCircle2, Lightbulb, MessageCircleQuestion, TriangleAlert, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createSupabaseClient } from '../../services/supabaseClient.js';
import { Drawer } from '../ui/Drawer.jsx';
import { StatePanel } from '../ui/StatePanel.jsx';

const TYPES = [
  ['issue', 'Report an issue', TriangleAlert],
  ['feature', 'Request a feature', Lightbulb],
  ['improvement', 'Suggest an improvement', Wrench],
  ['question', 'Ask a question', MessageCircleQuestion],
];

const EMPTY_FORM = { feedback_type: 'issue', impact: 'normal', title: '', details: '' };

export function FeedbackDrawer({ open, onClose, pagePath }) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [form, setForm] = useState(EMPTY_FORM);
  const [state, setState] = useState({ isSaving: false, error: null, success: false });

  useEffect(() => {
    if (open) setState({ isSaving: false, error: null, success: false });
  }, [open]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setState((current) => ({ ...current, error: null }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (state.isSaving || form.title.trim().length < 3 || form.details.trim().length < 10) return;
    setState({ isSaving: true, error: null, success: false });

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client.from('app_feedback').insert({
        submitted_by: user.id,
        submitter_name: user.fullName || user.username || null,
        submitter_email: user.primaryEmailAddress?.emailAddress || null,
        feedback_type: form.feedback_type,
        impact: form.impact,
        title: form.title.trim(),
        details: form.details.trim(),
        page_path: pagePath,
        app_context: {
          app_version: '3.0',
          mode: import.meta.env.MODE,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        },
      });
      if (error) throw error;
      setForm(EMPTY_FORM);
      setState({ isSaving: false, error: null, success: true });
    } catch (error) {
      console.error('Feedback submission failed', error);
      setState({ isSaving: false, error, success: false });
    }
  }

  const footer = state.success ? (
    <button type="button" className="primary-button" onClick={onClose}>Done</button>
  ) : (
    <>
      <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
      <button type="submit" form="app-feedback-form" className="primary-button" disabled={state.isSaving || form.title.trim().length < 3 || form.details.trim().length < 10}>
        {state.isSaving ? 'Sending...' : 'Send Feedback'}
      </button>
    </>
  );

  return (
    <Drawer open={open} onClose={onClose} eyebrow="Help Improve Northgate" title="Provide Feedback" description="Report something that is not working or suggest what we should build next." width="min(560px, 100vw)" footer={footer} labelledById="app-feedback-title">
      {state.success ? (
        <div className="feedback-success">
          <CheckCircle2 aria-hidden="true" />
          <h4>Thank you — your feedback was sent.</h4>
          <p>A Developer can now review it from the feedback queue.</p>
        </div>
      ) : (
        <form id="app-feedback-form" className="feedback-form" onSubmit={handleSubmit}>
          <fieldset>
            <legend>What would you like to share?</legend>
            <div className="feedback-type-picker">
              {TYPES.map(([value, label, Icon]) => (
                <button type="button" key={value} className={form.feedback_type === value ? 'is-active' : ''} onClick={() => update('feedback_type', value)} aria-pressed={form.feedback_type === value}>
                  <Icon aria-hidden="true" /><span>{label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <label><span>Title</span><input type="text" maxLength={160} value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Briefly describe the request" autoFocus /></label>
          <label><span>Details</span><textarea rows={7} maxLength={5000} value={form.details} onChange={(event) => update('details', event.target.value)} placeholder="What happened, what did you expect, or how would this improvement help?" /></label>
          <label><span>Impact</span><select value={form.impact} onChange={(event) => update('impact', event.target.value)}><option value="low">Low — nice to have</option><option value="normal">Normal — affects my workflow</option><option value="high">High — work is difficult</option><option value="blocking">Blocking — I cannot continue</option></select></label>
          <p className="feedback-context-note">We’ll include the current page ({pagePath}) and screen size to help diagnose the request. Do not include passwords or sensitive personal information.</p>
          {state.error ? <StatePanel tone="danger" eyebrow="Feedback Not Sent" title="Could not submit feedback" description={state.error.message || 'Please try again.'} compact /> : null}
        </form>
      )}
    </Drawer>
  );
}
