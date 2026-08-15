# Northgate HQ v3.0

New repo. Same backend. The front end gets rebuilt one module at a time while
v2.0 stays live and untouched.

## Setup

```bash
npm ci
cp .env.example .env      # same values as v2.0
npm run dev
```

Same Supabase project, same Clerk app, same data, same logins. Only the
front-end code is new.

## Deploy

Netlify, `npm ci && npm run build`, publish `dist`. `netlify.toml` includes the
SPA fallback so deep links resolve on refresh.

Deployed at **`rnsolutions.net/northgate`** via a Netlify proxy rewrite from the
landing-page site. Full setup, including the Clerk origin change, is in
`DEPLOY.md` — read it before the first deploy.

## Where things are

```
src/
  App.jsx              routing + auth boundary only — keep it small
  modules/
    registry.js        every module: route, nav, permission gate
    screens.js         MIGRATION PROGRESS — empty until modules land
    ModuleScreen.jsx   route-level auth re-check + stub fallback
  components/
    layout/            AppShell, TopNavigation, PrimarySidebar, SecondarySidebar
    ui/                WorkspaceHeader, RecordHeader, WorkspaceTabs, SummaryCard,
                       StatePanel, DataTable, StatusBadge, Toolbar, Drawer,
                       ConfirmDialog
  hooks/               ported from v2 — do not rewrite
  styles/              tokens.css -> base.css -> primitives.css
```

## Porting a module

1. Build `src/modules/<module>/<Module>Workspace.jsx` on the existing hooks.
2. Register it in `src/modules/screens.js`.
3. Flip `status` to `'live'` in `registry.js`.

Until step 2 it renders "still served by v2.0". A half-finished module cannot
leak into a demo.

See `MIGRATION_MAP.md` for the port order and what was deliberately left behind.

## Non-negotiables

Permissions server-side · balances transaction-derived · additive migrations only ·
snapshots immutable · audit never bypassed · archive over delete.
