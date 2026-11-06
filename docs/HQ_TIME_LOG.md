# HQ Time Log

## Scope and workflow

Developer Tools → HQ Time Log (`/hq-time`, or `/northgate/hq-time` on Production).
This standalone module records HQ work without touching jobs, budgets, payroll,
financials, or compensation agreements. Time belongs to a session once, not to
each work item. Focused minutes are an optional estimate, never a multiplier,
pay entitlement, or an extra duration added to elapsed time.

- Clock in and Clock out use server timestamps. The active entry survives
  refresh and other browsers. A database uniqueness rule allows one active
  session per performer; simultaneous clock-in requests also serialize.
- A past session can be entered manually. Clock out before correcting timer
  timestamps. Corrections preserve before/after history.
- Each table record opens a detail drawer with activity, hours classification,
  three note sections, and multiple independently tracked work items.
- Item states are Underway, Completed, and Discarded. Existing item identities
  cannot be removed. Discarding preserves the item and its change history.
- Archive is recoverable and excludes the session from totals. An active timer
  must be stopped before it can be archived.
- Blank classification means Needs classification. Blank focused minutes means
  not estimated, not zero. Date filters apply to the stored log date.
- The recorded IANA time zone travels with the session. Missing daylight-saving
  times are rejected; repeated times require an explicit occurrence choice.
- Unsaved edits remain in memory for the same signed-in account when navigating
  elsewhere in the SPA. Close/reload warns before discarding. Unsaved edits are
  not synchronized between browsers or stored on disk.

## Authorization and attribution

The gate uses HQ's canonical active technical Developer assignment, not a legacy
role label and not client-editable profile metadata. The same gate protects the
module, RLS, and RPCs. Anonymous and ordinary users cannot read or mutate the log.

An optional empty-by-default private tracker allowlist can support a separately
approved tracker-only account without granting general Developer privileges.
There is no public allowlist-management API. No real account grant is included
in this change. Validate the exact existing Clerk subject and obtain any required
approval before populating it. An inactive HQ identity is denied even if listed.

`performed_by` is the existing protected Primary identity (the work performer),
independent of the authenticated editor. `created_by`, `updated_by`, and immutable
audit `actor_id` record the actual editing identity. Clients cannot forge these
fields, versions, or audit records. The log and its audit use the same access
gate, with no copies sent to the broad HQ audit viewer.

## Database and API

Migration: `20261106114145_developer_hq_time_log.sql`. Originally generated with
`supabase migration new`; filename aligned to the version assigned by the hosted
staging migration tool. The migration is additive and creates only the log's
tables, functions, schema, grants, policies, triggers, and indexes.

- `current_user_can_track_hq_time()` returns the access decision.
- `list_hq_time_entries(p_include_archived)` and
  `list_hq_time_entry_history(p_id)` read saved records/history.
- `save_hq_time_entry(p_id, p_expected_version, p_payload)` saves a manual session
  or edits an existing one. A client UUID and null version make creates
  idempotent. Existing edits require the current version.
- `clock_in_hq_time_entry(p_id, p_activity, p_classification, p_time_zone)` and
  `clock_out_hq_time_entry(p_id, p_expected_version)` persist timer transitions.
- `set_hq_time_entry_archived(p_id, p_expected_version, p_archived)` archives or
  restores. Stale writes fail instead of overwriting another editor.

All browser calls reuse the existing Clerk → Supabase adapter and the signed-in
user's token. No service-role key or new credentials are introduced. These RPCs
are a supported account-authenticated path; they do not by themselves establish
an assistant integration. Verify the actual assistant account's gate and a real
signed-in read/write flow before claiming it can update the log. A privileged
SQL connector smoke test is not proof of the account's JWT/browser integration.

## Verification and release checkpoint, 2026-11-06

Feature base: staging commit `6fbdd3ff1a104ea5b374be5a087f86d866332fd3`.
Development was substantially behind staging, so the feature preserves the
current staging baseline rather than promoting unrelated older files.

Completed:
- Local Vite compile with dummy build-only values and isolated staging identity.
- Explicit existing `*.test.js`/`*.test.mjs` suite plus new model tests.
- Isolated PostgreSQL migration/security suite (`tests/hqTimeSecurity.sql`):
  two technical developers, legacy/ordinary/anonymous denial, narrow grant
  revocation, actor attribution, immutable atomic audit, direct-column attacks,
  stale versions, retries, timer uniqueness, backfills and item preservation.
- Migration applied only to existing isolated staging database. Hosted rollback
  smoke test verified canonical Developer access, clock-in/out, duplicate active
  prevention, attribution/audit, ordinary-user and anonymous denial. Afterwards,
  entries, audit rows and optional tracker grants were all zero.
- Mock React/jsdom interaction checks: error preservation, dirty Close/Back,
  notes/items, archive/restore, repeated clock-in, Back/Forward history, draft
  restoration, and denied-access no-read behavior.

- Desktop and 390-by-844 mobile browser checks passed on the isolated staging
  site with its actual signed-in Developer. Manual save, notes/work items, focused
  estimate, reload, immutable history, clock-in/out and active reload passed.
  Both synthetic sessions were stopped and recoverably archived.
- Native keyboard datetime entry, invalid range/focused estimate rejection, and
  precise timestamp preservation passed in the local browser mock.
- Developer Tools navigation is isolated from ordinary Add-On Tools. Direct and
  nested workspace headings, active rail/top labels, tracker-only/ordinary-addon
  permissions and the existing tracker runtime regressions passed locally.

Not verified/release gates:
- Simultaneous hosted requests and independent signed-in cross-browser flow.
- The Developer Tools label correction still needs deployed browser inspection.
- Assistant account access: legacy Developer labeling is not canonical technical
  access. No account permission was expanded. Tracker-only access can be enabled
  separately without broad Developer privileges after required approval.
- Ryan authorized selective Production promotion on 2026-11-06. The candidate
  is based on Production main `d0ce0ba`, not a wholesale staging merge. Unrelated
  EOS and estimate staging changes are excluded. See `releases/HQ_TIME_LOG_PRODUCTION_20261106.md` for the
  actual deployment state; authorization is not proof that deployment completed.

`npm test` without file selection starts the repository's long-running synthetic
editor server. It was stopped, not reported as a completed aggregate pass. Run
the explicit test-file list for a terminating unit suite. No lint/type-check
commands are declared by this JavaScript project's package scripts.

Staging security advisors flag the new private allowlist's intentional default
deny (RLS enabled, no policies) and the authorized binding lookup's checked
SECURITY DEFINER function. The lookup returns only the performer subject to an
authorized caller, is not anonymous-executable, and has a fixed search path.
Unrelated pre-existing advisor findings were not changed in this feature.

References:
- https://supabase.com/docs/guides/auth/third-party/clerk
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
