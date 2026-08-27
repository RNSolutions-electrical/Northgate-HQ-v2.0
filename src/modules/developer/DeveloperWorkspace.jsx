import { useAuth, useUser } from '@clerk/clerk-react';
import {
  Activity,
  BookOpenCheck,
  Cloud,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileClock,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  MessageSquareText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { useDevelopmentDisplayPreferences, useIncompleteHighlightPreference } from '../../hooks/useIncompleteHighlight.js';
import { createSupabaseClient } from '../../services/supabaseClient.js';
import { DeveloperFeedbackQueue } from './DeveloperFeedbackQueue.jsx';
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

const PERMISSION_GROUPS = [
  ['Developer', ['canAccessDeveloper', 'canManageUsers', 'canViewReports']],
  ['Inventory', ['canManageInventory', 'canInventoryTransactions', 'canViewAllDivisions', 'canEditCatalog']],
  ['Jobs', ['canCreateJobs', 'canManageJobs', 'canApproveBudget', 'canManageChangeOrders']],
  ['Change Orders', ['canCreateChangeOrders', 'canSubmitChangeOrders', 'canVerifyChangeOrders', 'canApproveChangeOrders', 'canReviseChangeOrders']],
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

const PERMISSION_FLAG_OPTIONS = PERMISSION_GROUPS.flatMap(([group, keys]) => keys.map((key) => ({
    key,
    flag: key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
    group,
    label: labelForPermission(key),
  })))
  .filter((option) => option.flag !== 'can_access_developer');

const PERMISSION_LEVEL_OPTIONS = ['User', 'Supervisor', 'Manager', 'Developer'];
const DIVISION_OPTIONS = ['Electrical', 'Construction', 'Admin'];

const PERMISSION_CONSOLE_COLUMNS = [
  {
    key: 'display_name',
    header: 'User',
    render: (row) => (
      <div className="developer-note-cell">
        <strong>{row.display_name || row.email || row.user_id}</strong>
        <span>{row.email || row.user_id}</span>
      </div>
    ),
  },
  { key: 'role', header: 'Level' },
  { key: 'division', header: 'Division', fallback: 'Unassigned' },
  {
    key: 'custom_permission_count',
    header: 'Custom',
    render: (row) => (
      <StatusBadge tone={row.custom_permission_count > 0 ? 'warn' : 'neutral'}>
        {row.custom_permission_count > 0 ? `${row.custom_permission_count} active` : 'None'}
      </StatusBadge>
    ),
  },
  {
    key: 'next_review_at',
    header: 'Next Review',
    render: (row) => formatDeveloperNoteDate(row.next_review_at),
  },
];

const DEFAULT_PERMISSION_FORM = Object.freeze({
  userId: '',
  reason: '',
  isSaving: false,
  error: null,
  success: '',
});

const DEFAULT_PROFILE_FORM = Object.freeze({
  userId: '',
  role: 'User',
  division: 'Electrical',
  reason: '',
  isSaving: false,
  error: null,
  success: '',
});

const DEFAULT_LONG_TERM_FORM = Object.freeze({
  overrideId: '',
  reason: '',
  isSaving: false,
  error: null,
  success: '',
});

const DEFAULT_AUDIT_EXPORT = Object.freeze({
  from: '',
  to: '',
  isExporting: false,
  error: null,
  success: '',
});

const AUDIT_EXPORT_COLUMNS = [
  'id', 'created_at', 'user_id', 'user_name', 'table_name', 'record_id',
  'action', 'note', 'before_data', 'after_data',
];

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

function csvCell(value) {
  let normalized = value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
  if (/^[=+\-@\t\r]/.test(normalized)) normalized = `'${normalized}`;
  return `"${normalized.replace(/"/g, '""')}"`;
}

function buildAuditCsv(rows) {
  const header = AUDIT_EXPORT_COLUMNS.map(csvCell).join(',');
  const body = rows.map((row) => AUDIT_EXPORT_COLUMNS.map((column) => csvCell(row[column])).join(','));
  return `\uFEFF${[header, ...body].join('\r\n')}`;
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

function useDeveloperPermissionConsole({ enabled }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    users: [],
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
        const { data, error } = await client.rpc('read_developer_permission_console');

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            users: data ?? [],
          });
        }
      } catch (error) {
        console.error('Developer permission console failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            users: [],
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
    async setOverride(form) {
      const client = await getClient();
      const changeOrderFlags = new Set([
        'can_create_change_orders',
        'can_submit_change_orders',
        'can_verify_change_orders',
        'can_approve_change_orders',
        'can_revise_change_orders',
      ]);
      return client.rpc(changeOrderFlags.has(form.permissionFlag)
        ? 'set_change_order_permission_override'
        : 'set_permission_override', {
        p_user_id: form.userId,
        p_permission_flag: form.permissionFlag,
        p_granted: form.granted,
        p_reason: form.reason.trim(),
      });
    },
    async clearOverride(form) {
      const client = await getClient();
      return client.rpc('clear_permission_override', {
        p_user_id: form.userId,
        p_permission_flag: form.permissionFlag,
        p_reason: form.reason.trim(),
      });
    },
    async updateProfile(form) {
      const client = await getClient();
      return client.rpc('update_user_permission_profile', {
        p_user_id: form.userId,
        p_role: form.role,
        p_division: form.division || null,
        p_reason: form.reason.trim(),
      });
    },
    async markLongTerm(form) {
      const client = await getClient();
      return client.rpc('mark_permission_override_long_term', {
        p_override_id: form.overrideId,
        p_reason: form.reason.trim(),
      });
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
    <section className="developer-links developer-console-page" aria-labelledby="developer-links-title">
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
  const { getToken } = useAuth();
  const { user } = useUser();
  const [highlightIncomplete, setHighlightIncomplete] = useIncompleteHighlightPreference();
  const {
    highlightDevelopment,
    hideDevelopment,
    setHighlightDevelopment,
    setHideDevelopment,
  } = useDevelopmentDisplayPreferences();
  const [noteForm, setNoteForm] = useState(DEFAULT_NOTE_FORM);
  const [permissionForm, setPermissionForm] = useState(DEFAULT_PERMISSION_FORM);
  const [profileForm, setProfileForm] = useState(DEFAULT_PROFILE_FORM);
  const [longTermForm, setLongTermForm] = useState(DEFAULT_LONG_TERM_FORM);
  const [selectedPermissionUserId, setSelectedPermissionUserId] = useState('');
  const [auditExport, setAuditExport] = useState(DEFAULT_AUDIT_EXPORT);
  const [activeConsolePage, setActiveConsolePage] = useState('overview');
  const [openFeedbackCount, setOpenFeedbackCount] = useState(0);
  const permissionRows = useMemo(() => buildPermissionRows(permissions), [permissions]);
  const grantedCount = permissionRows.filter((row) => row.value).length;
  const developerNotes = useDeveloperNotes({
    enabled: permissions.permissionSource === 'server' && permissions.canAccessDeveloper === true,
    permissions,
  });
  const permissionConsole = useDeveloperPermissionConsole({
    enabled: permissions.permissionSource === 'server' && permissions.canAccessDeveloper === true,
  });

  useEffect(() => {
    let mounted = true;
    async function loadFeedbackCount() {
      if (permissions.permissionSource !== 'server' || permissions.canAccessDeveloper !== true) return;
      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client.from('app_feedback').select('status');
        if (error) throw error;
        if (mounted) setOpenFeedbackCount((data ?? []).filter((row) => !['resolved', 'closed'].includes(row.status)).length);
      } catch (error) {
        console.error('Developer feedback count failed to load', error);
      }
    }
    loadFeedbackCount();
    return () => { mounted = false; };
  }, [getToken, permissions.canAccessDeveloper, permissions.permissionSource]);

  const openNotes = developerNotes.notes.filter((note) => !note.archived_at);
  const archivedNotes = developerNotes.notes.filter((note) => note.archived_at);
  const urgentNotes = openNotes.filter((note) => note.priority === 'high').length;
  const selectedPermissionUser = permissionConsole.users.find((row) => row.user_id === selectedPermissionUserId)
    ?? permissionConsole.users[0]
    ?? null;
  const activeOverrides = Array.isArray(selectedPermissionUser?.active_overrides)
    ? selectedPermissionUser.active_overrides
    : [];
  const customPermissionUsers = permissionConsole.users.filter((row) => row.custom_permission_count > 0);
  const reviewDueCount = customPermissionUsers.filter((row) => {
    if (!row.next_review_at) return false;
    return new Date(row.next_review_at).getTime() <= Date.now();
  }).length;
  const selectedOverrideByFlag = useMemo(() => {
    const map = new Map();
    activeOverrides.forEach((override) => {
      map.set(override.permission_flag, override);
    });
    return map;
  }, [activeOverrides]);

  useEffect(() => {
    if (!selectedPermissionUser) return;

    setProfileForm((current) => ({
      ...current,
      userId: selectedPermissionUser.user_id,
      role: PERMISSION_LEVEL_OPTIONS.includes(selectedPermissionUser.role) ? selectedPermissionUser.role : 'User',
      division: DIVISION_OPTIONS.includes(selectedPermissionUser.division) ? selectedPermissionUser.division : 'Electrical',
      error: null,
      success: '',
    }));
    setPermissionForm((current) => ({
      ...current,
      userId: selectedPermissionUser.user_id,
      error: null,
      success: '',
    }));
  }, [selectedPermissionUser]);

  function setNoteFormValue(key, value) {
    setNoteForm((current) => ({ ...current, [key]: value, error: null, success: '' }));
  }

  function setLongTermFormValue(key, value) {
    setLongTermForm((current) => ({ ...current, [key]: value, error: null, success: '' }));
  }

  function setProfileFormValue(key, value) {
    setProfileForm((current) => ({ ...current, [key]: value, error: null, success: '' }));
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

  async function handlePermissionStateChange(permissionFlag, nextState) {
    if (permissionForm.isSaving) return;
    const targetUserId = selectedPermissionUser?.user_id || permissionForm.userId || '';

    if (!targetUserId || !permissionFlag || !permissionForm.reason.trim()) {
      setPermissionForm((current) => ({ ...current, error: new Error('Enter a change reason before adjusting permissions.') }));
      return;
    }

    setPermissionForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const action = nextState === 'default'
        ? permissionConsole.clearOverride({
          userId: targetUserId,
          permissionFlag,
          reason: permissionForm.reason,
        })
        : permissionConsole.setOverride({
          userId: targetUserId,
          permissionFlag,
          granted: nextState === 'grant',
          reason: permissionForm.reason,
        });
      const { error } = await action;
      if (error) throw error;
      permissionConsole.reload();
      setSelectedPermissionUserId(targetUserId);
      setPermissionForm({ ...DEFAULT_PERMISSION_FORM, userId: targetUserId, success: 'Permission change saved and audit logged.' });
    } catch (error) {
      console.error('Permission override failed', error);
      setPermissionForm((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  async function handleProfileUpdate(event) {
    event.preventDefault();
    if (profileForm.isSaving) return;

    if (!profileForm.userId || !profileForm.role || !profileForm.division || !profileForm.reason.trim()) {
      setProfileForm((current) => ({ ...current, error: new Error('Choose level, division, and enter a change reason.') }));
      return;
    }

    setProfileForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const { error } = await permissionConsole.updateProfile(profileForm);
      if (error) throw error;
      permissionConsole.reload();
      setSelectedPermissionUserId(profileForm.userId);
      setProfileForm((current) => ({ ...current, isSaving: false, error: null, success: 'User level/division saved and audit logged.', reason: '' }));
    } catch (error) {
      console.error('Permission profile update failed', error);
      setProfileForm((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  async function handleLongTermSubmit(event) {
    event.preventDefault();
    if (longTermForm.isSaving) return;

    if (!longTermForm.overrideId || !longTermForm.reason.trim()) {
      setLongTermForm((current) => ({ ...current, error: new Error('Choose an active override and enter a long-term reason.') }));
      return;
    }

    setLongTermForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const { error } = await permissionConsole.markLongTerm(longTermForm);
      if (error) throw error;
      permissionConsole.reload();
      setLongTermForm({ ...DEFAULT_LONG_TERM_FORM, success: 'Custom permission marked long-term and audit logged.' });
    } catch (error) {
      console.error('Long-term permission acknowledgement failed', error);
      setLongTermForm((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  async function handleAuditExport(event) {
    event.preventDefault();
    if (auditExport.isExporting) return;

    const from = auditExport.from ? new Date(`${auditExport.from}T00:00:00.000Z`) : null;
    const to = auditExport.to ? new Date(`${auditExport.to}T00:00:00.000Z`) : new Date();
    if (auditExport.to) to.setUTCDate(to.getUTCDate() + 1);
    if ((from && Number.isNaN(from.getTime())) || Number.isNaN(to.getTime()) || (from && from >= to)) {
      setAuditExport((current) => ({ ...current, error: new Error('Choose a valid range. The From date must be before or equal to the Through date.'), success: '' }));
      return;
    }

    setAuditExport((current) => ({ ...current, isExporting: true, error: null, success: '' }));
    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const rows = [];
      const pageSize = 1000;
      let offset = 0;

      while (true) {
        const { data, error } = await client.rpc('read_developer_audit_log_export', {
          p_from: from?.toISOString() || null,
          p_to: to.toISOString(),
          p_limit: pageSize,
          p_offset: offset,
        });
        if (error) throw error;
        const page = data ?? [];
        rows.push(...page);
        if (page.length < pageSize) break;
        offset += page.length;
      }

      const csv = buildAuditCsv(rows);
      const { error: recordError } = await client.rpc('record_developer_audit_log_export', {
        p_from: from?.toISOString() || null,
        p_to: to.toISOString(),
        p_row_count: rows.length,
        p_format: 'csv',
      });
      if (recordError) throw recordError;

      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `northgate-full-audit-log-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setAuditExport((current) => ({ ...current, isExporting: false, error: null, success: `${rows.length.toLocaleString()} audit records exported. The export event was also added to the audit log.` }));
    } catch (error) {
      console.error('Developer audit export failed', error);
      setAuditExport((current) => ({ ...current, isExporting: false, error, success: '' }));
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
      <div className="developer-command-center">
        <WorkspaceHeader
          eyebrow="Developer Operations"
          title="Command Center"
          description="Monitor system access, control developer display modes, manage permissions, export audit evidence, and coordinate the development backlog."
          status={(
            <span className="status-pill status-pill--good">
              <Activity aria-hidden="true" /> Systems ready
            </span>
          )}
        />

        <section className="developer-command-hero" aria-label="Developer command center status">
          <div className="developer-command-hero__identity">
            <span className="developer-command-hero__icon"><LayoutDashboard aria-hidden="true" /></span>
            <div>
              <p className="eyebrow">Active Operator</p>
              <h3>{user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Developer'}</h3>
              <p>{permissions.role ?? 'User'} · {permissions.division ?? 'Unassigned'} · Northgate HQ v3.0</p>
            </div>
          </div>
          <div className="developer-command-hero__signals">
            <div className="developer-command-signal developer-command-signal--good">
              <span>Authorization</span>
              <strong>{permissions.permissionSource === 'server' ? 'Server verified' : 'Needs attention'}</strong>
            </div>
            <div className={`developer-command-signal${reviewDueCount ? ' developer-command-signal--warn' : ' developer-command-signal--good'}`}>
              <span>Access reviews</span>
              <strong>{reviewDueCount ? `${reviewDueCount} due` : 'Current'}</strong>
            </div>
            <div className={`developer-command-signal${urgentNotes ? ' developer-command-signal--warn' : ''}`}>
              <span>Priority backlog</span>
              <strong>{urgentNotes ? `${urgentNotes} high priority` : 'No urgent notes'}</strong>
            </div>
          </div>
        </section>

        <nav className="developer-command-nav" aria-label="Developer console sections">
          {[
            ['overview', 'Overview', LayoutDashboard],
            ['access', 'Access Control', KeyRound],
            ['feedback', 'User Feedback', MessageSquareText],
            ['audit', 'Audit Export', FileClock],
            ['backlog', 'Backlog', BookOpenCheck],
            ['systems', 'Systems', Cloud],
          ].map(([page, label, Icon]) => (
            <button
              type="button"
              key={page}
              className={activeConsolePage === page ? 'is-active' : ''}
              onClick={() => setActiveConsolePage(page)}
              aria-current={activeConsolePage === page ? 'page' : undefined}
            >
              <Icon aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </nav>

        <dl className="developer-status-rail">
          <div><dt>Granted flags</dt><dd>{grantedCount}<small>of {permissionRows.length}</small></dd></div>
          <div><dt>Managed users</dt><dd>{permissionConsole.users.length}<small>{customPermissionUsers.length} customized</small></dd></div>
          <div className={openFeedbackCount ? 'is-warning' : ''}><dt>User feedback</dt><dd>{openFeedbackCount}<small>active reports</small></dd></div>
          <div className={reviewDueCount ? 'is-warning' : ''}><dt>Reviews due</dt><dd>{reviewDueCount}<small>permission reviews</small></dd></div>
          <div className={urgentNotes ? 'is-warning' : ''}><dt>Open backlog</dt><dd>{openNotes.length}<small>{urgentNotes} high priority</small></dd></div>
          <div><dt>Environment</dt><dd>{import.meta.env.MODE}<small>application mode</small></dd></div>
        </dl>
      </div>

      {activeConsolePage === 'overview' ? (
      <section className="developer-console-page developer-overview-page" aria-label="Developer overview">
        <article className="developer-console-section">
          <Toolbar
            eyebrow="System Overview"
            title="Operator session"
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

        <article className="developer-console-section developer-toggle-card">
          <Toolbar
            eyebrow="Display Control"
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

        <article className="developer-console-section developer-toggle-card">
          <Toolbar
            eyebrow="Preview Control"
            title="Development-only cards"
            description="Highlight or hide scaffolding, boundary notes, permission debug cards, and implementation guidance to preview the end-user experience."
          />
          <label className="developer-highlight-toggle">
            <input
              type="checkbox"
              checked={highlightDevelopment}
              onChange={(event) => setHighlightDevelopment(event.target.checked)}
            />
            <span>
              <strong>{highlightDevelopment ? 'Highlighting development-only UI' : 'Highlight development-only UI'}</strong>
              <small>Shows scaffolding/status cards with a blue overlay while keeping them visible.</small>
            </span>
          </label>
          <label className="developer-highlight-toggle">
            <input
              type="checkbox"
              checked={hideDevelopment}
              onChange={(event) => setHideDevelopment(event.target.checked)}
            />
            <span>
              <strong>{hideDevelopment ? 'Hiding development-only UI' : 'Hide development-only UI'}</strong>
              <small>Removes marked scaffolding/status cards for cleaner end-user preview testing.</small>
            </span>
          </label>
          <StatePanel
            tone="neutral"
            eyebrow="Preview Rule"
            title="Operational data stays visible"
            description="Live tables, forms, actions, and production summary cards should stay visible. Only explicit development scaffolding is marked for this display mode."
            compact
            developmentOnly={false}
            incomplete={false}
          />
        </article>

        <article className="developer-console-section">
          <Toolbar
            eyebrow="Access Diagnostics"
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
      ) : null}

      {activeConsolePage === 'access' ? (
      <section className="developer-permissions developer-console-page" aria-label="Access control">
        <Toolbar
          eyebrow="Access Control"
          title="User permissions"
          description="Select a user, adjust their default level/division, or override individual flags. All changes require a reason and are audit logged."
          actions={(
            <button type="button" className="secondary-button" onClick={permissionConsole.reload} disabled={permissionConsole.isLoading}>
              Refresh Permissions
            </button>
          )}
        />

        <DataTable
          columns={PERMISSION_CONSOLE_COLUMNS}
          rows={permissionConsole.users}
          getRowKey={(row) => row.user_id}
          permissions={permissions}
          isLoading={permissionConsole.isLoading}
          error={permissionConsole.error}
          dense
          minWidth="760px"
          onRowClick={(row) => setSelectedPermissionUserId(row.user_id)}
          selectedRowKey={selectedPermissionUser?.user_id ?? null}
          emptyTitle="No permission users loaded"
          emptyDescription="The developer permission console RPC did not return active users."
        />

        {selectedPermissionUser ? (
          <div className="developer-permission-detail">
            <div className="developer-permission-detail__header">
              <div>
                <p className="eyebrow">Selected User</p>
                <h3>{selectedPermissionUser.display_name || selectedPermissionUser.email || selectedPermissionUser.user_id}</h3>
                <p>{selectedPermissionUser.email || selectedPermissionUser.user_id}</p>
              </div>
              <StatusBadge tone={activeOverrides.length > 0 ? 'warn' : 'neutral'}>
                {activeOverrides.length > 0 ? `${activeOverrides.length} custom permissions` : 'Defaults only'}
              </StatusBadge>
            </div>

            <form className="developer-permission-profile" onSubmit={handleProfileUpdate}>
              <label>
                <span>Level</span>
                <select value={profileForm.role} onChange={(event) => setProfileFormValue('role', event.target.value)} disabled={profileForm.isSaving}>
                  {PERMISSION_LEVEL_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </label>
              <label>
                <span>Division</span>
                <select value={profileForm.division} onChange={(event) => setProfileFormValue('division', event.target.value)} disabled={profileForm.isSaving}>
                  {DIVISION_OPTIONS.map((division) => <option key={division} value={division}>{division}</option>)}
                </select>
              </label>
              <label className="developer-permission-profile__reason">
                <span>Profile change reason</span>
                <input type="text" maxLength={500} value={profileForm.reason} onChange={(event) => setProfileFormValue('reason', event.target.value)} disabled={profileForm.isSaving} placeholder="Required to save level/division" />
              </label>
              <button type="submit" className="primary-button" disabled={profileForm.isSaving || !profileForm.reason.trim()}>
                Save Profile
              </button>
            </form>
            {profileForm.error ? (
              <StatePanel tone="danger" eyebrow="Profile Save Failed" title="Level or division was not saved" description={profileForm.error.message || 'Unexpected profile update error.'} compact />
            ) : null}
            {profileForm.success ? (
              <StatePanel tone="success" eyebrow="Saved" title="Permission profile updated" description={profileForm.success} compact />
            ) : null}

            <label className="developer-permission-reason">
              <span>Permission change reason</span>
              <textarea rows={2} maxLength={500} value={permissionForm.reason} onChange={(event) => setPermissionForm((current) => ({ ...current, reason: event.target.value, error: null, success: '' }))} disabled={permissionForm.isSaving} placeholder="Required before changing any permission below" />
            </label>
            {permissionForm.error ? (
              <StatePanel tone="danger" eyebrow="Permission Save Failed" title="Permission change was not saved" description={permissionForm.error.message || 'Unexpected permission update error.'} compact />
            ) : null}
            {permissionForm.success ? (
              <StatePanel tone="success" eyebrow="Saved" title="Permission updated" description={permissionForm.success} compact />
            ) : null}

            <div className="developer-permission-matrix table-wrap">
              <table className="data-table data-table--dense">
                <thead>
                  <tr>
                    <th scope="col">Permission</th>
                    <th scope="col">Default</th>
                    <th scope="col">Grant</th>
                    <th scope="col">Deny</th>
                    <th scope="col">Effective</th>
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_FLAG_OPTIONS.map((option) => {
                    const override = selectedOverrideByFlag.get(option.flag);
                    const state = override ? (override.granted ? 'grant' : 'deny') : 'default';
                    const baseValue = selectedPermissionUser.base_permissions?.[option.flag] === true;
                    const effectiveValue = selectedPermissionUser.effective_permissions?.[option.flag] === true;

                    return (
                      <tr key={option.flag}>
                        <td data-label="Permission">
                          <div className="developer-permission-name">
                            <strong>{option.label}</strong>
                            <span>{option.group}</span>
                          </div>
                        </td>
                        {['default', 'grant', 'deny'].map((nextState) => (
                          <td key={nextState} className="data-table__cell--center" data-label={nextState}>
                            <input
                              type="radio"
                              name={`${selectedPermissionUser.user_id}:${option.flag}`}
                              checked={state === nextState}
                              disabled={permissionForm.isSaving}
                              aria-label={`${option.label} ${nextState}`}
                              onChange={() => handlePermissionStateChange(option.flag, nextState)}
                            />
                          </td>
                        ))}
                        <td data-label="Effective">
                          <StatusBadge tone={override ? (effectiveValue ? 'warn' : 'danger') : effectiveValue ? 'good' : 'neutral'}>
                            {override ? (effectiveValue ? 'Granted override' : 'Denied override') : baseValue ? 'Granted default' : 'Denied default'}
                          </StatusBadge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <form className="developer-permission-review" onSubmit={handleLongTermSubmit}>
              <label>
                <span>Long-term override</span>
                <select value={longTermForm.overrideId} onChange={(event) => setLongTermFormValue('overrideId', event.target.value)} disabled={longTermForm.isSaving || activeOverrides.length === 0}>
                  <option value="">Choose active custom permission</option>
                  {activeOverrides.map((override) => (
                    <option key={override.id} value={override.id}>
                      {override.permission_flag} {override.granted ? 'granted' : 'denied'} - {override.review_cadence}
                    </option>
                  ))}
                </select>
              </label>
              <label className="developer-permission-profile__reason">
                <span>Long-term reason</span>
                <input type="text" maxLength={500} value={longTermForm.reason} onChange={(event) => setLongTermFormValue('reason', event.target.value)} disabled={longTermForm.isSaving || activeOverrides.length === 0} placeholder="Required to reduce reminder frequency" />
              </label>
              <button type="submit" className="secondary-button" disabled={longTermForm.isSaving || !longTermForm.overrideId || !longTermForm.reason.trim()}>
                Mark Long-Term
              </button>
            </form>
            {longTermForm.error ? (
              <StatePanel tone="danger" eyebrow="Review Save Failed" title="Long-term acknowledgement was not saved" description={longTermForm.error.message || 'Unexpected permission review error.'} compact />
            ) : null}
            {longTermForm.success ? (
              <StatePanel tone="success" eyebrow="Saved" title="Review cadence updated" description={longTermForm.success} compact />
            ) : null}
          </div>
        ) : (
          <StatePanel tone="neutral" title="Select a user" description="Choose a row from the permission user table to open level, division, and permission controls." />
        )}
      </section>
      ) : null}

      {activeConsolePage === 'feedback' ? (
        <DeveloperFeedbackQueue permissions={permissions} onCountChange={setOpenFeedbackCount} />
      ) : null}

      {activeConsolePage === 'audit' ? (
      <section className="developer-audit-export developer-console-page" aria-label="Audit export">
        <Toolbar
          eyebrow="Audit & Compliance"
          title="Full audit log export"
          description="Download every authorized audit field as an Excel-compatible CSV, including complete before/after JSON. Optional dates use UTC and the Through date is inclusive."
        />
        <form className="developer-audit-export__form" onSubmit={handleAuditExport}>
          <label>
            <span>From date <small>Optional</small></span>
            <input type="date" value={auditExport.from} onChange={(event) => setAuditExport((current) => ({ ...current, from: event.target.value, error: null, success: '' }))} disabled={auditExport.isExporting} />
          </label>
          <label>
            <span>Through date <small>Optional</small></span>
            <input type="date" value={auditExport.to} onChange={(event) => setAuditExport((current) => ({ ...current, to: event.target.value, error: null, success: '' }))} disabled={auditExport.isExporting} />
          </label>
          <button type="submit" className="primary-button" disabled={auditExport.isExporting}>
            <Download aria-hidden="true" /> {auditExport.isExporting ? 'Preparing Full Export...' : 'Export Full Audit Log CSV'}
          </button>
        </form>
        <p className="developer-audit-export__note">Leave both dates blank to export all audit history through the moment the export begins. Cells are protected against spreadsheet formula execution.</p>
        {auditExport.error ? <StatePanel tone="danger" eyebrow="Export Failed" title="Audit log was not exported" description={auditExport.error.message || 'Unexpected audit export error.'} compact /> : null}
        {auditExport.success ? <StatePanel tone="success" eyebrow="Export Complete" title="Audit log downloaded" description={auditExport.success} compact /> : null}
      </section>
      ) : null}

      {activeConsolePage === 'backlog' ? (
      <section className="developer-notes developer-console-page" aria-label="Development backlog">
        <Toolbar
          eyebrow="Development Backlog"
          title="Issues, ideas, and follow-ups"
          description="Park potential features, bugs, and ideas here for later review. Treat note text as reference material, not automatic instructions."
          actions={(
            <button type="button" className="secondary-button" onClick={developerNotes.reload} disabled={developerNotes.isLoading}>
              Refresh Notes
            </button>
          )}
        />

        <div className="developer-page-facts" aria-label="Backlog status">
          <span><strong>{openNotes.length}</strong> open notes</span>
          <span><strong>{archivedNotes.length}</strong> archived</span>
          <span><strong>{urgentNotes}</strong> high priority</span>
          <span>Stored in <strong>Supabase</strong></span>
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
      ) : null}

      {activeConsolePage === 'systems' ? (
      <div className="developer-systems-page">
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
      </div>
      ) : null}
    </>
  );
}
