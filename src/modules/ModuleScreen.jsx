import { Navigate } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions.js';
import { findModule, isModulePermitted } from './registry.js';
import { WorkspaceHeader } from '../components/ui/WorkspaceHeader.jsx';
import { StatePanel } from '../components/ui/StatePanel.jsx';
import { MODULE_SCREENS } from './screens.js';
import { UiElement } from '../components/ui/UiElement.jsx';

/**
 * Renders a module.
 *
 * Two jobs, in this order:
 *   1. Re-check authorization at the route. Nav omission is convenience; a
 *      user who types /accounting directly must still be turned away.
 *      (The server is the real boundary — this is defence in depth.)
 *   2. Render the migrated screen if one is registered, otherwise the
 *      not-yet-migrated placeholder.
 *
 * As each module is ported from v2, add it to screens.js and flip its registry
 * status to 'live'. Nothing else changes.
 */
export function ModuleScreen({ moduleKey }) {
  const permissions = usePermissions();
  const module = findModule(moduleKey);

  if (!module) return <Navigate to="/dashboard" replace />;

  if (permissions.isLoading) {
    return (
      <StatePanel
        eyebrow="Northgate HQ"
        title="Checking your access..."
        description="Hold tight while the server permission record loads."
        tone="neutral"
        compact
      />
    );
  }

  if (!isModulePermitted(module, permissions)) {
    return <Navigate to="/dashboard" replace />;
  }

  const Screen = MODULE_SCREENS[moduleKey];

  if (Screen) {
    return (
      <UiElement as="section" className="ng-page-scope" type="PAGE" name={module.label}>
        <Screen permissions={permissions} module={module} />
      </UiElement>
    );
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="NORTHGATE HQ"
        title={module.label}
        description={module.description}
      />
      <StatePanel
        tone="info"
        eyebrow="Not yet migrated"
        title={`${module.label} is still served by Northgate HQ v2.0`}
        description="This workspace has not been ported into v3 yet. It remains fully functional in v2.0 — nothing has been lost or turned off."
      />
    </>
  );
}
