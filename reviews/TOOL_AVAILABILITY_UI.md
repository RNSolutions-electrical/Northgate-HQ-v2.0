# Tool Availability controls

## Outcome and boundary
Developer Tools now includes a Tool Availability console for whole workspaces in the current environment. All start enabled. Dashboard and Developer Tools stay protected. Existing permissions are never granted by enabling a tool or entering developer preview.

Disabled tools are removed from standard workspace/add-on navigation, dashboard sections, and assigned-review links. The common route boundary covers nested estimator pages, inventory scan routes, legacy service-performance links and all registered workspaces. Ordinary users receive an unavailable screen rather than mounted tool content. Active, server-verified developers must enter deliberately through the console's preview link; preview is clearly labeled and retains normal permissions. Server guards enforce the ordinary/developer boundary independently of client state.

The client refreshes availability on focus, local settings changes and every 30 seconds. An open client can retain a visible screen briefly, but new API requests are guarded server-side. In-flight work and already-downloaded data are not retroactively recalled. Users should save before disabling a workspace.

## Operational notes
- Apply backend migration and verify enforcement before enabling disable actions. The UI does not silently fall back to enabled if availability cannot be loaded.
- Hosted QA may briefly toggle only the approved Tools workspace, with safety restore; leave Estimator and Daybook enabled. Local browser tests use synthetic data.
- Per-tool versions reject stale settings. Changes are confirmed and audited. Re-enabling remains possible even if enforcement readiness is unhealthy.
- Disabling is not deleting. Shared data can have dependencies in other workspaces; presentation-only Reports/Accounting are not new data-classification boundaries.
- Add future modules to registry, availability catalogue and server map together. Unknown endpoints fail closed while a tool is disabled, so endpoint-map review is a release requirement.

## Verification
Unit coverage checks unknown/missing status, protected recovery routes, path aliases, explicit server-verified developer preview, navigation and dashboard omission. The browser harness tests cancellation, disable/re-enable, intentional preview versus direct-link blocking, ordinary-user denial, API failure, and a 390px console layout. Database coverage is in TOOL_AVAILABILITY_BACKEND.md. Local tests use synthetic settings and data only.

## Safe rollback
Before reverting app code, re-enable tools through the authorized console (preserving audit). Keep the private configuration/history tables. If needed restore the prior staging API-hook configuration, but do not drop guards or data blindly. Restore reviewed view definitions only from verified snapshots. Production is not part of this release.
