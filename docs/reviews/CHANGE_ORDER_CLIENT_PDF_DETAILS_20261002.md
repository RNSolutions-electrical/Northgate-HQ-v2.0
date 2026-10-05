# Optional Change Order client PDF details — local implementation checkpoint

Sync marker: `CO-CLIENT-DETAILS-20261002-003`.
Date/time: 2026-10-02 12:34 EDT (UTC-04:00), machine `RYAN_NORTHGATE`.
Branch: `feature/change-order-client-details-20261002`, based on `85047fc`.
This work is local and not deployed. Production and Staging data were not changed.

## Owner rule

The Change Order line total is authoritative. Client-facing detail is optional
and never changes financial posting. A user may enter descriptions only,
quantity/unit and unit price (calculated amount), an explicit manual amount,
or a mixture. Manual amount takes precedence over quantity x unit price for
that displayed detail. The editor shows the entered subtotal and difference
from the parent line; a mismatch warns but does not block saving or export.
The user can elect to print a calculated remaining-balance row, with a custom
label, so a partial itemization reconciles visually to the parent line.

## Implementation

- A compact **Add detailed breakdown** dialog on each existing CO pricing
  line supports up to 40 rows, with description, quantity, unit, unit price,
  optional manual amount, Add/Remove, and optional remaining-balance row.
  The normal pricing editor stays compact. Submitted/approved records are
  view-only and retain their established edit/revision gates.
- The client PDF prints the details beneath the parent line, with escaped
  text and compact page-break-aware rows. Parent line and CO totals are
  unchanged. Existing lines with no details print as before.
- `20261002160002_change_order_client_pdf_breakdown.sql` adds nullable JSONB
  to `change_order_lines`, a constrained authenticated draft-save wrapper
  around the existing financial RPC, and revision copying for the new field.
  It is additive for historical lines. The wrapper leaves the old RPC in
  place for older clients and relies on its authorization, draft-state,
  markup, cost-code, and audit checks.
- The audit record from the existing draft-save RPC includes the submitted
  detail payload; no new permission or financial calculation was introduced.

## Verification and release gates

- 231 explicit Node tests pass, including amount/remaining calculations,
  signed details, optional descriptions, mismatch behavior, and PDF HTML
  escaping/authoritative total. `git diff --check` passes.
- Placeholder-configuration Vite compile passes. That bundle is **not**
  deployable. Build again with the actual Production target configuration.
- The migration file was generated with Supabase CLI 2.119.0 and passed six
  isolated PGlite assertions for DDL, save/re-save, invalid-input rollback,
  and revision copying. That harness stubs the existing financial save RPC,
  so it alone does **not** prove live permissions or totals. The migration
  remains unapplied to Production and Staging. The full-schema restore
  rehearsal documented below subsequently verified the database permissions,
  totals, approved locks, revision copying, and financial posting. Legacy PDF
  behavior remains covered by the existing test suite; Production deployment
  still requires an approved recovery point.
- A synthetic eight-line, three-page PDF rendered successfully in Edge and
  was visually checked on all pages. Details wrap, table headers repeat after
  page breaks, and the client total/authorization remain legible. A real owner
  example is still recommended before Production promotion.
- GitHub `origin/main` was freshly fetched and remains `85047fc`; this branch
  has no newer main commit to integrate. Read-only Production database checks
  confirmed the existing markup/revision RPC signatures and definitions,
  active line-table RLS, authenticated-only legacy save access, and that the
  new column has not yet been applied. No Production DDL or data write occurred.
  Keep the unfinished Inventory Management and Staging CO revamp out of this
  focused Production candidate.
- The full `npm test` discovery also starts a browser fixture that remains
  running; it was stopped without a result. All 231 explicit test files pass.
- A temporary schema-only Supabase branch was created with owner approval at
  $0.01344/hour. Supabase populated only 31 early migrations in that branch,
  leaving `change_order_lines` absent. The full-schema rehearsal could not
  run; the migration failed before any table change. The temporary branch was
  deleted and its absence confirmed. Production and Staging were untouched.
- On October 2, Ryan approved a separate restore of the 07:42:43 UTC Production
  backup into `northgate-co-client-pdf-rehearsal-20261002` in RNSolutions. The
  dashboard quoted $10.18 additional monthly compute/disk while it existed.
  The restored full schema contained the existing Change Order line, draft
  markup-save, and revision functions. The candidate migration applied there
  successfully. Transactional synthetic tests passed for draft detail
  save/reload and edit, unchanged $110 price/$100 cost, malformed-input
  rejection, unauthorized-write rejection, approved-record lock, unchanged
  $110 financial posting, and copying details to a linked revision while
  preserving the approved original. Synthetic jobs, users, and Change Orders
  were rolled back and verified absent. The new RPC grants `authenticated`
  execution and denies `anon`; the security advisor did not flag the new
  function. Ryan then authorized deletion of the temporary restored project,
  and its absence from the project list was verified. Production still lacks
  the candidate column; Staging was untouched.
- Remaining gates: review a real owner Change Order PDF example if desired,
  confirm the Production recovery point immediately before promotion, build
  with the Production environment (not placeholder configuration), obtain
  explicit Production migration/deployment approval, then verify the live
  draft/PDF workflow and rollback readiness. This rehearsal alone does not
  authorize promotion.

Re-run the isolated SQL check with `PGLITE_MODULE` pointing to a local PGlite
`dist/index.js`, then `node scripts/verify-change-order-client-details-db.mjs`.

Rollback: republish the prior Production application deploy. Leave the
nullable column and new RPC in place initially; do not delete historical
records or revert approved financial data. If later removing the RPC/column,
first verify no saved client details depend on them.
