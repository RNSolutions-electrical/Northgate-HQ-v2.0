import { useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSilas } from '../../hooks/useSilas.js';
import { getSupabaseAccessToken } from '../../services/clerkToken.js';
import { createSupabaseClient } from '../../services/supabaseClient.js';
import { GuidedChangeOrder } from './GuidedChangeOrder.jsx';
import { SilasWorkspacePanel } from './SilasPanels.jsx';

export function SilasWorkspace({ permissions }) {
  const silas = useSilas({ permissions });
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState('home');
  const [jobs, setJobs] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [directoryError, setDirectoryError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (view !== 'choose-job' || permissions.permissionSource !== 'server') return;
    let active = true;
    async function load() {
      setLoading(true);
      setDirectoryError('');
      try {
        const token = await getSupabaseAccessToken(getToken);
        const db = createSupabaseClient(token);
        const [jobResult, draftResult] = await Promise.all([
          db.from('jobs').select('id,name,division,job_type').is('archived_at', null).order('name'),
          db.from('change_orders').select('id,job_id,co_number,title,status,guided_state').eq('status', 'draft').is('archived_at', null),
        ]);
        if (jobResult.error) throw jobResult.error;
        if (active) { setJobs((jobResult.data || []).filter((job) => job.job_type !== 'service_call')); setDrafts((draftResult.data || []).filter((draft) => draft.guided_state?.workflow === 'change_order')); }
        if (draftResult.error && active) setDirectoryError('Projects loaded, but existing Change Order drafts could not be listed under this account.');
      } catch (error) { if (active) setDirectoryError(error.message || 'Projects could not be loaded.'); }
      finally { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [getToken, permissions.permissionSource, view]);

  if (view === 'guided' && selectedJob) return <GuidedChangeOrder
    key={selectedDraft?.id || selectedJob.id}
    job={selectedJob}
    initialOrder={selectedDraft}
    permissions={permissions}
    onClose={() => { setSelectedJob(null); setSelectedDraft(null); setView('choose-job'); }}
    onOpenDraft={(draft) => navigate('/jobs', { state: { openJobId: selectedJob.id, openTab: 'change_orders', openChangeOrderId: draft.id } })}
  />;

  if (view === 'home') return <section className="card card--wide silas-workspace guided-co" aria-label="Silas assistance"><div><p className="eyebrow">Northgate HQ assistance</p><h1>What can Silas help you with?</h1><p>Guided workflows build real drafts without using an AI service.</p></div><div className="guided-co__actions"><button type="button" className="primary-button" onClick={() => setView('choose-job')}>Help me build a Change Order</button>{silas.canUseSilas ? <button type="button" className="secondary-button" onClick={() => setView('chat')}>Ask Silas Anything</button> : null}</div>{!silas.settingsLoading && !silas.canUseSilas ? <p>AI assistance is off. Guided workflows remain available.</p> : null}</section>;

  if (view === 'choose-job') return <section className="card card--wide silas-workspace guided-co" aria-label="Select Change Order project"><div><p className="eyebrow">Silas · Guided workflow</p><h1>Choose a project</h1><p>Silas will use the project you select and will not ask you to re-enter its details.</p></div>{directoryError ? <div className="alert" role="alert">{directoryError}</div> : null}{loading ? <p>Loading projects…</p> : null}{!permissions.canCreateChangeOrders ? <p>Your current permissions do not allow Change Order drafts. Silas cannot bypass that permission.</p> : <><label>Project<select defaultValue="" onChange={(event) => { const job = jobs.find((candidate) => candidate.id === event.target.value); if (job) { setSelectedJob(job); setSelectedDraft(null); setView('guided'); } }}><option value="">Select a project</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.name} · {job.division}</option>)}</select></label>{drafts.length ? <div><h2>Resume a guided draft</h2><div className="guided-co__review-lines">{drafts.map((draft) => { const job = jobs.find((candidate) => candidate.id === draft.job_id); return job ? <article key={draft.id}><strong>{draft.co_number} · {draft.title}</strong><span>{job.name}</span><button type="button" className="secondary-button" onClick={() => { setSelectedJob(job); setSelectedDraft(draft); setView('guided'); }}>Resume</button></article> : null; })}</div></div> : null}</>}<button type="button" className="secondary-button" onClick={() => setView('home')}>Back to Silas</button></section>;

  return (
    <><button type="button" className="secondary-button" onClick={() => setView('home')}>← Silas options</button><SilasWorkspacePanel
      enabled={silas.canUseSilas}
      settingsLoading={silas.settingsLoading}
      settingsError={silas.settingsError}
      conversations={silas.conversations}
      conversationsLoading={silas.conversationsLoading}
      activeConversationId={silas.activeConversationId}
      messages={silas.messages}
      messagesLoading={silas.messagesLoading}
      draftMessage={silas.draftMessage}
      setDraftMessage={silas.setDraftMessage}
      onSend={silas.sendMessage}
      onSelectConversation={silas.setActiveConversationId}
      onNewConversation={silas.startNewConversation}
      statusMessage={silas.statusMessage}
      chatError={silas.chatError}
      isSending={silas.isSending}
      responseSource={silas.responseSource}
    /></>
  );
}
