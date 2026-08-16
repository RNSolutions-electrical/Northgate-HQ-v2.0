import { useAuth, useUser } from '@clerk/clerk-react';
import {
  Cloud,
  Copy,
  Database,
  ExternalLink,
  GitBranch,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { useIncompleteHighlightPreference } from '../../hooks/useIncompleteHighlight.js';
import { createSupabaseClient } from '../../services/supabaseClient.js';
import {
  DEVELOPER_HELPFUL_LINKS,
  FUTURE_USER_MANAGEMENT_CAPABILITIES,
  SUPABASE_PROJECT_REFERENCE,
} from '../../config/developerHelpfulLinks.js';

const LINK_ICONS = {
  supabase: Database,
  clerk: Users,
  github: GitBranch,
  netlify: Cloud,
};

const PERMISSION_COLUMNS = [
  { key: 'label', header: 'Permission' },
  { key: 'value', header: 'State', render: (row) => (row.value ? 'Granted' : 'Not granted') },
  { key: 'group', header: 'Area' },
];

const EMPTY_DEVELOPER_NOTES = Object.freeze([]);

const DEVELOPER_NOTE_FIELDS = [
  'id',
  'created_at',
  'updated_at',
  'archived_at',
  'created_by',
  'archived_by',
  'note_type',
  'priority',
  'status',
  'title',
  'body',
].join(', ');

const DEFAULT_NOTE_FORM = Object.freeze({
  note_type: 'idea',
  priority: 'normal',
  title: '',
  body: '',
  isSaving: false,
  error: null,
  success: '',
});

const NOTE_TYPE_OPTIONS = ['feature', 'bug', 'idea', 'question', 'other'];
const NOTE_PRIORITY_OPTIONS = ['low', 'normal', 'high'];

const DEVELOPER_NOTE_COLUMNS = [
  {
    key: 'title',
    header: 'Note',
    render: (row) => (
      <div className="developer-note-cell">
        <strong>{row.title}</strong>
        <span>{row.body}</span>
      </div>
    ),
  },
  {
    key: 'note_type',
    header: 'Type',
    render: (row) => <StatusBadge tone="neutral">{row.note_type}</StatusBadge>,
  },
  {
    key: 'priority',
    header: 'Priority',
    render: (row) => <StatusBadge tone={row.priority === 'high' ? 'warn' : 'neutral'}>{row.priority}</StatusBadge>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusBadge tone={row.status === 'open' ? 'warn' : row.status === 'reviewed' ? 'good' : 'neutral'}>{row.status}</StatusBadge>,
  },
  {
    key: 'updated_at',
    header: 'Updated',
    render: (row) => formatDeveloperNoteDate(row.updated_at),
  },
];

const PERMISSION_GROUPS = [
  ['Developer', ['canAccessDeveloper', 'canManageUsers', 'canViewReports']],
  ['Inventory', ['canManageInventory', 'canInventoryTransactions', 'canViewAllDivisions', 'canEditCatalog']],
  ['Jobs', ['canCreateJobs', 'canManageJobs', 'canApproveBudget', 'canManageChangeOrders']],
  ['People and assets', ['canManageEmployees', 'canManageVehicles', 'canManageTools']],
  ['Financials and estimates', ['canEstimate', 'canApproveEstimates', 'canViewFinancials']],
  ['Workflow', ['canFieldAccess', 'canArchiveRecords', 'canExpressCheckout', 'canApproveExpressCheckout', 'canDeferCompletion']],
];

function labelForPermission(key) {
  return key
    .replace(/^can/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim();
}

function buildPermissionRows(permissions) {
  return PERMISSION_GROUPS.flatMap(([group, keys]) =>
    keys.map((key) => ({
      key,
      group,
      label: labelForPermission(key),
      value: permissions?.[key] === true,
    })),
  );
}

function formatDeveloperNoteDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '-';
  }
}

function useDeveloperNotes({ enabled, permissions }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    notes: EMPTY_DEVELOPER_NOTES,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled) {
        setState((current) => ({ ...current, isLoading: false }));
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client
          .from('developer_notes')
          .select(DEVELOPER_NOTE_FIELDS)
          .order('archived_at', { ascending: true, nullsFirst: true })
          .order('updated_at', { ascending: false });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            notes: data ?? EMPTY_DEVELOPER_NOTES,
          });
        }
      } catch (error) {
        console.error('Developer notes failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            notes: EMPTY_DEVELOPER_NOTES,
          });
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [enabled, getToken, refreshKey]);

  async function getClient() {
    const token = await getToken({ template: 'supabase' });
    return createSupabaseClient(token);
  }

  return {
    ...state,
    reload: () => setRefreshKey((current) => current + 1),
    async createNote(form) {
      const client = await getClient();
      return client
        .from('developer_notes')
        .insert({
          created_by: permissions.userId,
          note_type: NOTE_TYPE_OPTIONS.includes(form.note_type) ? form.note_type : 'idea',
          priority: NOTE_PRIORITY_OPTIONS.includes(form.priority) ? form.priority : 'normal',
          title: form.title.trim(),
          body: form.body.trim(),
        })
        .select(DEVELOPER_NOTE_FIELDS)
        .single();
    },
    async updateNote(id, patch) {
      const client = await getClient();
      return client
        .from('developer_notes')
        .update(patch)
        .eq('id', id)
        .select(DEVELOPER_NOTE_FIELDS)
        .single();
    },
  };
}

function DeveloperHelpfulLinks() {
  const [copyStatus, setCopyStatus] = useState('');

  async function copyProjectReference() {
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }

      await navigator.clipboard.writeText(SUPABASE_PROJECT_REFERENCE);
      setCopyStatus('Supabase project reference copied.');
    } catch {
      setCopyStatus('Copy failed. Select the project reference and copy it manually.');
    }
  }

  return (
    <section className="developer-links" aria-labelledby="developer-links-title">
      <Toolbar
        eyebrow="Developer Console"
        title="Helpful links"
        description="Administrative systems used to maintain Northgate HQ, with source-controlled guidance for each destination."
      />

      <div className="developer-links__grid">
        {DEVELOPER_HELPFUL_LINKS.map((link) => {
          const Icon = LINK_ICONS[link.id] ?? ExternalLink;

          return (
            <article className="developer-link-card" key={link.id}>
              <div className="developer-link-card__heading">
                <span className="developer-link-card__icon" aria-hidden="true">
                  <Icon />
                </span>
                <div>
                  <h3>{link.title}</h3>
                  <p>{link.purpose}</p>
                </div>
              </div>

              {link.reference ? (
                <div className="developer-link-card__reference">
                  <span>Project reference</span>
                  <code>{link.reference}</code>
                </div>
              ) : null}

              <div className="developer-link-card__actions">
                <a
                  className="primary-button"
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${link.actionLabel} in a new tab`}
                >
                  <ExternalLink aria-hidden="true" /> {link.actionLabel}
                </a>
                {link.id === 'supabase' ? (
                  <button type="button" className="secondary-button" onClick={copyProjectReference}>
                    <Copy aria-hidden="true" /> Copy reference
                  </button>
                ) : null}
              </div>

              <div className="developer-link-card__instructions">
                <h4>What to do</h4>
                <ol>
                  {link.instructions.map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                  ))}
                </ol>
              </div>

              <div className="developer-link-card__caution">
                <strong>Important</strong>
                <p>{link.caution}</p>
              </div>
            </article>
          );
        })}
      </div>

      <p className="developer-links__copy-status" role="status" aria-live="polite">
        {copyStatus}
      </p>
    </section>
  );
}

export function DeveloperWorkspace({ permissions }) {
  const { user } = useUser();
  const [highlightIncomplete, setHighlightIncomplete] = useIncompleteHighlightPreference();
  const [noteForm, setNoteForm] = useState(DEFAULT_NOTE_FORM);
  const permissionRows = useMemo(() => buildPermissionRows(permissions), [permissions]);
  const grantedCount = permissionRows.filter((row) => row.value).length;
  const developerNotes = useDeveloperNotes({
    enabled: permissions.permissionSource === 'server' && permissions.canAccessDeveloper === true,
    permissions,
  });
  const openNotes = developerNotes.notes.filter((note) => !note.archived_at);
  const archivedNotes = developerNotes.notes.filter((note) => note.archived_at);

  function setNoteFormValue(key, value) {
    setNoteForm((current) => ({ ...current, [key]: value, error: null, success: '' }));
  }

  async function handleNoteCreate(event) {
    event.preventDefault();
    if (noteForm.isSaving) return;

    if (!noteForm.title.trim() || !noteForm.body.trim()) {
      setNoteForm((current) => ({ ...current, error: new Error('Enter a note title and detail before saving.') }));
      return;
    }

    setNoteForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const { error } = await developerNotes.createNote(noteForm);
      if (error) throw error;
      developerNotes.reload();
      setNoteForm({ ...DEFAULT_NOTE_FORM, success: 'Developer note saved.' });
    } catch (error) {
      console.error('Developer note save failed', error);
      setNoteForm((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  async function handleNoteStatus(note, status) {
    setNoteForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const patch = status === 'archived'
        ? { status: 'archived', archived_at: new Date().toISOString(), archived_by: permissions.userId }
        : { status, archived_at: null, archived_by: null };
      const { error } = await developerNotes.updateNote(note.id, patch);
      if (error) throw error;
      developerNotes.reload();
      setNoteForm({ ...DEFAULT_NOTE_FORM, success: `Developer note marked ${status}.` });
    } catch (error) {
      console.error('Developer note update failed', error);
      setNoteForm((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  const developerNoteColumns = [
    ...DEVELOPER_NOTE_COLUMNS,
    {
      key: 'actions',
      header: 'Actions',
      width: '210px',
      render: (row) => (
        <div className="developer-note-actions" onClick={(event) => event.stopPropagation()}>
          {row.status !== 'reviewed' && !row.archived_at ? (
            <button type="button" className="secondary-button" onClick={() => handleNoteStatus(row, 'reviewed')} disabled={noteForm.isSaving}>
              Reviewed
            </button>
          ) : null}
          {row.archived_at ? (
            <button type="button" className="secondary-button" onClick={() => handleNoteStatus(row, 'open')} disabled={noteForm.isSaving}>
              Reopen
            </button>
          ) : (
            <button type="button" className="secondary-button secondary-button--danger" onClick={() => handleNoteStatus(row, 'archived')} disabled={noteForm.isSaving}>
              Archive
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Developer"
        description="Developer-only status, diagnostics, and approved administrative links. This screen remains gated by the existing server-authoritative developer access check."
        status={(
          <span className="status-pill status-pill--good">
            Developer access confirmed
          </span>
        )}
      />

      <div className="summary-grid">
        <SummaryCard label="Role" value={permissions.role ?? 'User'} detail="Server-authoritative role" />
        <SummaryCard label="Division" value={permissions.division ?? 'Unassigned'} detail="Current operator division" />
        <SummaryCard label="Granted flags" value={grantedCount} detail={`${permissionRows.length} tracked flags`} />
        <SummaryCard label="Permission source" value={permissions.permissionSource} detail="Must remain server-derived" tone={permissions.permissionSource === 'server' ? 'good' : 'warn'} />
        <SummaryCard label="Incomplete overlay" value={highlightIncomplete ? 'On' : 'Off'} detail="Local developer view option" tone={highlightIncomplete ? 'warn' : 'default'} incomplete={highlightIncomplete} />
      </div>

      <section className="developer-grid">
        <article className="card workspace-card">
          <Toolbar
            eyebrow="Diagnostics"
            title="Current session"
            description="Read-only context for the signed-in developer. No secret values or service-role tokens are displayed."
          />

          <div className="profile-field-grid">
            <div className="profile-field">
              <span>Signed in as</span>
              <strong>{user?.primaryEmailAddress?.emailAddress ?? user?.id ?? 'Unknown user'}</strong>
            </div>
            <div className="profile-field">
              <span>Clerk user id</span>
              <strong>{permissions.userId ?? 'Unavailable'}</strong>
            </div>
            <div className="profile-field">
              <span>Mode</span>
              <strong>{import.meta.env.MODE}</strong>
            </div>
            <div className="profile-field">
              <span>Build</span>
              <strong>Northgate HQ v3.0</strong>
            </div>
          </div>

          <StatePanel
            tone="neutral"
            eyebrow="Boundary"
            title="Developer scope remains status-oriented"
            description="This module does not add granular permission editors, SQL consoles, service-role access, environment secret views, or target-user effective-permission viewers."
            compact
          />
        </article>

        <article className="card workspace-card developer-toggle-card">
          <Toolbar
            eyebrow="Developer Overlay"
            title="Incomplete component highlights"
            description="Highlights deferred, reserved, disabled, and roadmap surfaces across the app without blocking normal testing."
          />
          <label className="developer-highlight-toggle">
            <input
              type="checkbox"
              checked={highlightIncomplete}
              onChange={(event) => setHighlightIncomplete(event.target.checked)}
            />
            <span>
              <strong>{highlightIncomplete ? 'Highlighting incomplete components' : 'Highlight incomplete components'}</strong>
              <small>Transparent yellow overlay. This setting is stored in this browser only.</small>
            </span>
          </label>
          <StatePanel
            tone="neutral"
            eyebrow="Automation"
            title="Updates from component markers"
            description="Shared panels and roadmap controls opt into the highlight from their incomplete status. When the marker is removed during a future completion pass, the yellow highlight disappears automatically."
            compact
            incomplete={false}
          />
        </article>

        <article className="card workspace-card">
          <Toolbar
            eyebrow="Server Permissions"
            title="Effective access snapshot"
            description="These values come from the existing permission hook and render fail-closed when unknown."
          />
          <DataTable
            columns={PERMISSION_COLUMNS}
            rows={permissionRows}
            getRowKey={(row) => row.key}
            permissions={permissions}
            dense
            minWidth="520px"
            emptyTitle="No permission flags loaded"
            emptyDescription="The permission hook has not returned a usable effective-permission snapshot."
          />
        </article>
      </section>

      <section className="developer-notes card workspace-card">
        <Toolbar
          eyebrow="Developer Notes"
          title="Nightstand backlog"
          description="Park potential features, bugs, and ideas here for later review. Treat note text as reference material, not automatic instructions."
          actions={(
            <button type="button" className="secondary-button" onClick={developerNotes.reload} disabled={developerNotes.isLoading}>
              Refresh Notes
            </button>
          )}
        />

        <div className="summary-grid developer-notes__summary">
          <SummaryCard label="Open notes" value={openNotes.length} detail="Visible for future review" tone={openNotes.length ? 'warn' : 'default'} />
          <SummaryCard label="Archived notes" value={archivedNotes.length} detail="Kept for context" />
          <SummaryCard label="Storage" value="Supabase" detail="Developer-only table" tone="good" />
        </div>

        <form className="developer-note-form" onSubmit={handleNoteCreate}>
          <div className="developer-note-form__grid">
            <label>
              <span>Type</span>
              <select value={noteForm.note_type} onChange={(event) => setNoteFormValue('note_type', event.target.value)} disabled={noteForm.isSaving}>
                {NOTE_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label>
              <span>Priority</span>
              <select value={noteForm.priority} onChange={(event) => setNoteFormValue('priority', event.target.value)} disabled={noteForm.isSaving}>
                {NOTE_PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
              </select>
            </label>
            <label className="developer-note-form__wide">
              <span>Title</span>
              <input type="text" maxLength={160} value={noteForm.title} onChange={(event) => setNoteFormValue('title', event.target.value)} disabled={noteForm.isSaving} placeholder="Short note title" />
            </label>
            <label className="developer-note-form__full">
              <span>Details</span>
              <textarea rows={4} maxLength={4000} value={noteForm.body} onChange={(event) => setNoteFormValue('body', event.target.value)} disabled={noteForm.isSaving} placeholder="Feature idea, bug note, implementation thought, or question for later." />
            </label>
          </div>
          {noteForm.error ? (
            <StatePanel tone="danger" eyebrow="Note Save Failed" title="Developer note was not saved" description={noteForm.error.message || 'Unexpected developer note error.'} compact />
          ) : null}
          {noteForm.success ? (
            <StatePanel tone="success" eyebrow="Saved" title="Developer notes updated" description={noteForm.success} compact />
          ) : null}
          <div className="developer-note-form__actions">
            <button type="submit" className="primary-button" disabled={noteForm.isSaving || !noteForm.title.trim() || !noteForm.body.trim()}>
              Save Note
            </button>
          </div>
        </form>

        <DataTable
          columns={developerNoteColumns}
          rows={developerNotes.notes}
          getRowKey={(row) => row.id}
          permissions={permissions}
          isLoading={developerNotes.isLoading}
          error={developerNotes.error}
          dense
          minWidth="920px"
          emptyTitle="No developer notes yet"
          emptyDescription="Add rough ideas, bugs, or feature notes here when you want them saved for later review."
        />
      </section>

      <DeveloperHelpfulLinks />

      <aside className="developer-future-note ng-incomplete-component" aria-labelledby="developer-future-note-title">
        <div>
          <p className="eyebrow">Planned - not yet implemented</p>
          <h3 id="developer-future-note-title">Future: User Management</h3>
          <p>User invitation and permission setup will eventually move into a controlled Northgate workflow.</p>
        </div>
        <ul>
          {FUTURE_USER_MANAGEMENT_CAPABILITIES.map((capability) => (
            <li key={capability}>{capability}</li>
          ))}
        </ul>
        <ShieldCheck aria-hidden="true" />
      </aside>
    </>
  );
}
