# Northgate HQ v0.5.4 — optional Change Order client PDF details

Sync marker: `CO-CLIENT-DETAILS-RELEASE-20261002-001`.
Prepared: 2026-10-02 13:10 EDT (UTC-04:00), machine `RYAN_NORTHGATE`.
Environment: Production candidate; not evidence of deployment by itself.

## Scope

- Add an optional detail editor to each Change Order pricing line. Description,
  quantity, unit, unit price, and manual amount can be shown on the client PDF.
- Show an optional calculated remaining-balance row for partial itemizations.
  A mismatch warns but does not block a draft or PDF export. The parent Change
  Order line amount remains the financial source of truth.
- Add nullable `change_order_lines.client_breakdown` and an authenticated
  draft-save wrapper; controlled revisions copy details without changing the
  approved original. Existing drafts, approved records, and older clients
  remain compatible.

## Release verification

- 231 explicit Node tests pass, with no failures.
- Production-configured Vite build passes, using the live site's public Clerk
  and Supabase build variables and `/northgate` base path.
- The candidate migration applied successfully to a complete isolated restore
  of the October 2 Production backup. Transactional tests passed for detail
  save/reload, validation, permissions, unchanged totals and posting, approved
  lock, and revision copying. Test data was rolled back; the temporary project
  was deleted with owner approval.
- Production's October 2 07:42:43 UTC daily physical backup was complete before
  promotion. Supabase daily backups exclude Storage objects. This release
  does not alter Storage objects or rewrite existing financial rows.
- Production security-advisor baseline before migration: 21 info, 4 error,
  230 warning findings in existing schema objects. Compare after migration;
  do not attribute pre-existing findings to this release.

## Promotion and rollback

Apply only `20261002160002_change_order_client_pdf_breakdown.sql` to Production,
then promote the tagged code deliberately. Verify a new draft's optional
details, PDF appearance, authoritative total, and a legacy Change Order PDF.
If the new UI fails, republish prior Netlify deploy
`6abbecb04fce2f00078da7bf` (v0.5.3). Leave the new nullable column and RPC
in place initially; removing them is unnecessary for a frontend rollback and
could discard newly entered presentation details. A full database restore
would lose changes since its backup and is not the default rollback.

The complete implementation review is in
`docs/reviews/CHANGE_ORDER_CLIENT_PDF_DETAILS_20261002.md`.

## Production promotion — 2026-10-02

- Owner-approved migration `change_order_client_pdf_breakdown` is recorded in
  Production Supabase history as `20261002171310`. Read-only checks confirmed
  the nullable column and authenticated-only RPC; the existing anonymous
  security-advisor findings did not increase.
- `main` was fast-forwarded to tagged release commit
  `ca35b83c867d2a94e01c7f45ea69be14106a5282` and GitHub Release `v0.5.4`
  was published without reusing an earlier tag.
- Netlify Production deploy `6abfe6d0df400a474bf2171b` published at
  2026-10-02 17:16:17 UTC. Netlify reports the tagged commit, a ready deploy,
  and no build errors. The Production site's current deploy matches this ID.
- A signed-out read-only visit to `https://rnsolutions.net/northgate/` routed
  to Clerk sign-in. Authenticated in-app acceptance remains for the owner to
  check; no Production Change Order was created merely for smoke testing.
- Frontend rollback remains republishing prior deploy
  `6abbecb04fce2f00078da7bf`. Keep the additive schema in place on rollback.
