# Migration Map — v2.0 → v3.0

What was kept, what gets rebuilt, and what was deliberately left behind.

Built against `RNSolutions-electrical/Northgate-HQ-v2.0` @ `a355b7b`
(ARCHITECTURE v2.30, HANDOFF Entry 150).

---

## KEPT — ported unchanged, 3,700+ lines

These were already correct. They were never the problem.

### Data hooks (~1,340 lines)

| File | Why it survives |
|---|---|
| `useInventoryCart.js` | Speaks to the cart-open RPC correctly, including the server-derived vehicle snapshot |
| `useInventoryCountIntake.js` | Uses the atomic find-or-create + `physical_count_correction` path |
| `useInventoryCountCorrection.js` | The only sanctioned quantity-reconciliation path |
| `useInventoryCountSheet.js` | Count sheet read model |
| `useInventoryReadModel.js` | Division-scoped reads per §17a |
| `useInventoryTransactionHistory.js` | Ledger reads with correct ordering |
| `useBinItemRetirement.js` | Zero-balance-gated archive via the controlled RPC |
| `usePermissions.js` | Server-backed, fails closed to `DENY_ALL` |
| `useSilas.js` | Requesting-user JWT, existing provider |

**These are the most valuable thing in the v2 front end.** They encode months of
learning about which RPC to call and in what order. Rewriting them would be the
single easiest way to break the backend contract.

### Shell and UI primitives (~600 lines)

`AppShell`, `TopNavigation`, `PrimarySidebar`, `SecondarySidebar`,
`WorkspaceHeader`, `RecordHeader`, `WorkspaceTabs`, `SummaryCard`, `StatePanel`
— small, clean, already matching the §50 locked UI system.

Plus the five added this week: `DataTable`, `StatusBadge`, `Toolbar`, `Drawer`,
`ConfirmDialog`.

### Utilities and tokens

`lib/locationQr.js`, `lib/qrCode.js`, `styles/tokens.css`,
`modules/silas/SilasPanels.jsx`.

---

## REBUILT

| v2 | Lines | What happens |
|---|---|---|
| `src/App.jsx` | 13,991 | Split into `src/modules/<module>/`. One module at a time. |
| `src/styles.css` | 1,607 | **Deleted.** Legacy dark theme. |
| `src/styles/layout.css` | 2,555 | **Deleted.** Was a light-theme override layer patching the dark base. |

Replaced by `src/styles/base.css` — about 520 lines, one theme, built straight
on the tokens.

**CSS bundle: 116 kB → 19.5 kB.** Same look, one theme instead of two fighting.

---

## LEFT BEHIND ON PURPOSE

| v2 file | Why |
|---|---|
| `src/hooks/userPermissions.js` | Hardcoded `role: 'Developer'`, `canAccessDeveloper: true`. Dead code, one character from the real hook. Drift register D-01. |
| `src/lib/supabaseClient.js` | Dead re-export shim. D-08. |
| module-level `supabase` export | Anonymous client with no token. Unused, but a footgun. D-08. |

---

## FIXED IN TRANSIT

**D-02 — permission flags.** §17 locks 22 canonical flags; v2's `DENY_ALL`
defined 19. Added `can_express_checkout`, `can_approve_express_checkout`,
`can_defer_completion` plus their camelCase accessors. v2 failed closed by luck
(`undefined` is falsy); v3 fails closed by design.

**D-06 — dependency pinning.** Every dependency now pinned to the exact version
v2 resolves to today. No more `"latest"`. `netlify.toml` uses `npm ci`.

---

## PORT ORDER

Cheapest and lowest-risk first, so the pattern is proven before it meets
anything dangerous.

| # | Module | Notes |
|---|---|---|
| 1 | Dashboard | Read-only aggregates. Proves the pattern. |
| 2 | Developer | Small, Developer-only, lowest blast radius. |
| 3 | Reports | Read-only by definition. |
| 4 | Documents | Storage paths and RLS unchanged. |
| 5 | Vehicles | Self-contained. |
| 6 | Tools | Catalogue foundation only (§36); deferred features stay deferred. |
| 7 | Employees | PII needs a presentation-contract audit. |
| 8 | Silas | Panels already extracted. |
| 9 | Estimates | Verify snapshot immutability untouched. |
| 10 | Jobs | Largest. Where NGG-PM lands. |
| 11 | Inventory | **Last.** Cart, checkout, ledger, counts, overdraw locks. |
| 12 | Accounting | Depends on Jobs and Inventory being done. |

Inventory is last on purpose. It carries the densest invariant load in the
system, and it should be ported by someone who has already done ten of these.

---

## HOW A MODULE LANDS

1. Build `src/modules/<module>/<Module>Workspace.jsx` using the ported hooks.
2. Add one line to `src/modules/screens.js`.
3. Flip `status: 'stub'` → `'live'` in `src/modules/registry.js`.

That's it. Until step 2, the module renders "still served by v2.0" — so a
half-finished module can never leak into the demo.

`screens.js` is the progress bar. Empty today.

---

## KNOWN, NOT URGENT

`@clerk/clerk-react@5.61.3` is deprecated in favor of `@clerk/react` (core 3).
v2 uses the same package, so v3 is no worse off. **Do not migrate auth libraries
before the presentation.** Revisit after.

---

## RULES THAT CARRY OVER UNCHANGED

1. Permissions server-authoritative. Client hiding is never security.
2. Inventory balances transaction-derived. Never write `inventory_balances`.
3. No destructive migrations. Additive only.
4. Approved estimate snapshots immutable.
5. Audit logging never bypassed.
6. Archive over delete.

Note that none of these live in the code being replaced. That is precisely why
this rebuild is low-risk.
