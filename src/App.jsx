import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout.jsx';
import { InventoryScanRoute } from './modules/inventory/InventoryWorkspace.jsx';
import { ModuleScreen } from './modules/ModuleScreen.jsx';
import { MODULES } from './modules/registry.js';
import { lazy, Suspense } from 'react';
const WorkbenchRoute = lazy(() => import('./modules/estimates/workbench/WorkbenchRoute.jsx'));

/**
 * App.jsx is routing and auth boundary only.
 *
 * In v2 this file was 13,991 lines and held every module. It stays small here
 * on purpose — if it starts growing, something is being put in the wrong place.
 */
export default function App() {
  return (
    <>
      <SignedIn>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/estimates" element={<Suspense fallback={<p>Loading estimator...</p>}><WorkbenchRoute /></Suspense>} />
            <Route path="/estimates/assemblies" element={<Suspense fallback={<p>Loading assemblies...</p>}><WorkbenchRoute libraryOnly /></Suspense>} />
            <Route path="/estimates/workbench" element={<Suspense fallback={<p>Loading estimator...</p>}><WorkbenchRoute /></Suspense>} />
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/scan/location/:locationId" element={<InventoryScanRoute />} />
            {MODULES.map((module) => (
              <Route
                key={module.key}
                path={`${module.path}/*`}
                element={<ModuleScreen moduleKey={module.key} />}
              />
            ))}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </SignedIn>

      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
