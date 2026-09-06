import { UserButton, useClerk } from '@clerk/clerk-react';
import { MessageSquarePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FeedbackDrawer } from '../feedback/FeedbackDrawer.jsx';
import { useDevelopmentDisplayPreferences, useIncompleteHighlightPreference } from '../../hooks/useIncompleteHighlight.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { permittedModules, permittedNavigationGroups } from '../../modules/registry.js';
import { AppShell } from './AppShell.jsx';
import { StatePanel } from '../ui/StatePanel.jsx';
import { DiagnosticsProvider } from '../ui/Diagnostics.jsx';

/**
 * Composes the shell around whichever module route is active.
 *
 * Nav items are the permitted set only. An unauthorized module is absent from
 * the array — never rendered disabled. See 04_PRESENTATION_CONTRACT.md §4.
 */
export function AppLayout() {
  const { signOut } = useClerk();
  const permissions = usePermissions();
  const [highlightIncomplete] = useIncompleteHighlightPreference();
  const { highlightDevelopment, showUiTerminology, highlightUndefinedUi, showDiagnostics } = useDevelopmentDisplayPreferences();
  const diagnosticsEnabled = permissions.permissionSource === 'server' && permissions.canAccessDeveloper === true && showDiagnostics;
  const navigate = useNavigate();
  const location = useLocation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('ng-highlight-incomplete', permissions.canAccessDeveloper === true && highlightIncomplete);
    document.documentElement.classList.toggle('ng-highlight-development', diagnosticsEnabled && highlightDevelopment);
    document.documentElement.classList.toggle('ng-hide-development', !diagnosticsEnabled);
    document.documentElement.classList.toggle('ng-show-ui-terminology', permissions.canAccessDeveloper && showUiTerminology);
    document.documentElement.classList.toggle('ng-highlight-undefined-ui', permissions.canAccessDeveloper && highlightUndefinedUi);
    return () => {
      document.documentElement.classList.remove('ng-highlight-incomplete');
      document.documentElement.classList.remove('ng-highlight-development');
      document.documentElement.classList.remove('ng-hide-development');
      document.documentElement.classList.remove('ng-show-ui-terminology');
      document.documentElement.classList.remove('ng-highlight-undefined-ui');
    };
  }, [highlightIncomplete, highlightDevelopment, diagnosticsEnabled, permissions.canAccessDeveloper, showUiTerminology, highlightUndefinedUi]);

  if (permissions.isLoading) {
    return (
      <div className="ng-boot">
        <StatePanel eyebrow="Northgate HQ" title="Checking your access…" tone="neutral" compact />
      </div>
    );
  }

  if (permissions.error) {
    return (
      <div className="ng-boot">
        <StatePanel
          tone="danger"
          eyebrow="Northgate HQ"
          title="Could not confirm your access"
          description="Your permissions could not be loaded, so nothing is shown. Refresh, or contact a Developer if this continues."
        />
      </div>
    );
  }

  const modules = permittedModules(permissions);
  const activeKey = modules.find((module) =>
    location.pathname.startsWith(module.path),
  )?.key;

  const navItems = permittedNavigationGroups(permissions);
  const activeModule = modules.find((module) => module.key === activeKey);

  return (
    <DiagnosticsProvider permissions={permissions} enabled={showDiagnostics}>
      <AppShell
      eyebrow="HEADQUARTERS"
      title="Northgate"
      buildLabel="v3.0"
      navItems={navItems}
      activeWorkspace={activeKey}
      activeWorkspaceLabel={activeModule?.label ?? 'Workspace'}
      workspaceResetKey={location.state?.workspaceHomeKey ?? location.pathname}
      onBack={() => navigate(-1)}
      onDashboard={() => navigate('/dashboard')}
      onWorkspaceHome={() => {
        if (!activeModule) {
          navigate('/dashboard');
          return;
        }
        const workspaceHomeKey = Date.now();
        const navigationState = activeModule.key === 'jobs'
          ? { directoryType: 'jobs', openJobsDirectory: workspaceHomeKey, workspaceHomeKey }
          : { workspaceHomeKey };
        navigate(activeModule.path, { state: navigationState });
      }}
      onOpenWorkspace={(selection) => {
        const key = typeof selection === 'string' ? selection : selection?.key;
        const targetKey = selection?.path ? selection.key.replace(/-(service-calls|electrical|construction|admin|my-profile)$/, '') : key;
        const target = modules.find((module) => module.key === targetKey)
          ?? modules.find((module) => module.key === key)
          ?? navItems.find((item) => item.key === key)?.items?.[0];
        if (!target) return;
        const navigationState = selection?.navigationState
          ?? (target.key === 'jobs' ? { directoryType: 'jobs', openJobsDirectory: Date.now() } : undefined);
        navigate(target.path, navigationState ? { state: navigationState } : undefined);
      }}
      identitySummary={{
        role: permissions.role,
        division: permissions.department ?? 'No department',
      }}
      feedbackControl={(
        <button type="button" className="ng-shell__feedback-button" onClick={() => setFeedbackOpen(true)}>
          <MessageSquarePlus aria-hidden="true" />
          <span>Provide Feedback</span>
        </button>
      )}
      profileControl={(
        <>
          <button type="button" className="secondary-button" onClick={() => signOut({ redirectUrl: '/' })}>
            Sign out
          </button>
          <UserButton afterSignOutUrl="/" />
        </>
      )}
      >
        <Outlet />
      </AppShell>
      <FeedbackDrawer open={feedbackOpen} onClose={() => setFeedbackOpen(false)} pagePath={location.pathname} />
    </DiagnosticsProvider>
  );
}
