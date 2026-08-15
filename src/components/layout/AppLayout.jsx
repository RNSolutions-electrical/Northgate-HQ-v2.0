import { UserButton } from '@clerk/clerk-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions.js';
import { permittedModules } from '../../modules/registry.js';
import { AppShell } from './AppShell.jsx';
import { StatePanel } from '../ui/StatePanel.jsx';

/**
 * Composes the shell around whichever module route is active.
 *
 * Nav items are the permitted set only. An unauthorized module is absent from
 * the array — never rendered disabled. See 04_PRESENTATION_CONTRACT.md §4.
 */
export function AppLayout() {
  const permissions = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();

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

  const navItems = modules.map((module) => ({
    key: module.key,
    label: module.label,
    icon: module.icon,
  }));

  return (
    <AppShell
      eyebrow="HEADQUARTERS"
      title="Northgate"
      buildLabel="v3.0"
      navItems={navItems}
      activeWorkspace={activeKey}
      onOpenWorkspace={(key) => {
        const target = modules.find((module) => module.key === key);
        if (target) navigate(target.path);
      }}
      identitySummary={{
        role: permissions.role,
        division: permissions.division ?? 'No division',
      }}
      profileControl={<UserButton afterSignOutUrl="/" />}
    >
      <Outlet />
    </AppShell>
  );
}
