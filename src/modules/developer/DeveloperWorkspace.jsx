import { useUser } from '@clerk/clerk-react';
import {
  Cloud,
  Copy,
  Database,
  ExternalLink,
  GitBranch,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { useIncompleteHighlightPreference } from '../../hooks/useIncompleteHighlight.js';
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
  const permissionRows = useMemo(() => buildPermissionRows(permissions), [permissions]);
  const grantedCount = permissionRows.filter((row) => row.value).length;

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
