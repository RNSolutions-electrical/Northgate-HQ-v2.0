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
  const { highlightDevelopment, hideDevelopment, showUiTerminology, highlightUndefinedUi } = useDevelopmentDisplayPreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('ng-highlight-incomplete', highlightIncomplete);
    document.documentElement.classList.toggle('ng-highlight-development', highlightDevelopment);
    document.documentElement.classList.toggle('ng-hide-development', hideDevelopment);
    document.documentElement.classList.toggle('ng-show-ui-terminology', permissions.canAccessDeveloper && showUiTerminology);
    document.documentElement.classList.toggle('ng-highlight-undefined-ui', permissions.canAccessDeveloper && highlightUndefinedUi);
    return () => {
      document.documentElement.classList.remove('ng-highlight-incomplete');
      document.documentElement.classList.remove('ng-highlight-development');
      document.documentElement.classList.remove('ng-hide-development');
      document.documentElement.classList.remove('ng-show-ui-terminology');
      document.documentElement.classList.remove('ng-highlight-undefined-ui');
    };
  }, [highlightIncomplete, highlightDevelopment, hideDevelopment, permissions.canAccessDeveloper, showUiTerminology, highlightUndefinedUi]);

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

  return (
    <>
      <AppShell
      eyebrow="HEADQUARTERS"
      title="Northgate"
      buildLabel="v3.0"
      navItems={navItems}
      activeWorkspace={activeKey}
      onOpenWorkspace={(key) => {
        const target = modules.find((module) => module.key === key);
        if (!target) return;
        navigate(target.path, key === 'jobs' ? { state: { openJobsDirectory: Date.now() } } : undefined);
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
    </>
  );
}
