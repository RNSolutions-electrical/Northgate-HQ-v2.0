# Daybook staging pilot — 2026-11-16

Mode: Production Mode (defined implementation), target staging only.
Base staging commit: 55081eb96daa1a140cef0a576926cf4ef7aea850.

## Scope
Preserves the existing Daybook calendar, jobs, crew planner, contacts, notes, PTO,
worker profiles and visual privacy lock in a sandboxed frame inside HQ navigation.
No writes to employee, job, financial, payroll or external calendar modules.
The standalone source and its browser storage are not read, migrated, or changed.
The November 13 export is explicitly not a current-data source.

Shared database tables hold documents by scope/owner, rather than one table per
person. Personal calendars/events, unclassified notes and unlinked contacts stay
private to the signed-in owner. Northgate calendar records, worker profiles and
worker-linked contacts are company scope. Company data access and all pilot access
are developer-only pending a reviewed operational permission rollout.

Save to HQ is explicit. Stale versions reject the complete save. Restore requires
saved current edits, confirmation and atomic pre-restore history. Recovery history
can restore a prior state and itself creates a recovery point. The iframe has no
same-origin access or localStorage use; tokens stay in the host.

## Verification
- Source splitting, frame syntax and no-localStorage tests passed.
- Local PostgreSQL/PGlite tests passed: owner isolation, inactive/nondeveloper denial,
  direct access denial, optimistic versions, atomic rollback, restore audit, immutable history.
- Explicit test-file suite: 404 passed, 1 pre-existing skip, 0 failed.
- Local compilation passed with synthetic nondeployable development settings;
  never deploy that output. Initial configured build correctly refused missing keys.
- Browser mock-RPC QA: load blank, create entry, dirty state, explicit save, history,
  confirmation and restore to empty passed. Fixed missing sandbox allow-forms.
- Hosted authenticated RPC, real staging build/deploy and phone layout not yet verified.

## Migration / release
Apply migration only to verified staging ref fazfwzbuesvzhgodckiw; never production
keogysnoukbendfkfjcn. Publication to public repository requires Ryan's specific
approval. No data should be embedded in source or test fixtures.

For current-data import, Ryan must export the actual newer standalone browser data,
review it, then import into Daybook staging after verifying the empty pilot and
recovery flow. Do not navigate/modify his live planner to generate test data.

## Deferred
- Central Dropbox folder/folder-handle persistence and dated JSON backup automation.
- Durable JSON export provenance (current display truthfully says download requested;
  it does not assert filesystem completion).
- Wider employee permissions and offboarding/personal-data retention policy.
- Production promotion after staging testing and separate approval.

## Final review and staging database receipt
Fixed restore-in-flight editing with an inert frame, retained unsaved drafts across
SPA navigation by user identity, keyed sessions to prevent account-switch display
leakage, and validated reconstructed backups in the full planner before RPC writes.
Cross-scope ID collisions preserve private records under deterministic private IDs.
Staging migration applied 2026-11-16; both tables RLS enabled, anonymous RPC denied,
direct authenticated inserts denied, documents/history both empty. No user data migrated.
Ryan approved public staging publication. Per-user default calendar (Ryan prefers
Northgate), calendar naming and preferences-home refinements are tracked for before
production, not required to delay the staging pilot.
