# Labor-rate release review — 2026-10-12

## Status and provenance

This is an isolated implementation and reviewable patch under
`Documents/Codex/2026-10-12/task/northgate-labor-rates`, based on
`dev-eos-pursuit-tracker-20261006` / `8f4e4b8`. These changes have **not** been applied
to Ryan's active Dropbox repository. No branch was created there, and no Git
metadata was repaired. During this review, no shared migration, deployment, push or business-record
write occurred. A later owner-authorized Staging-only rollout applies this patch
in a separate staging checkout; see ASSEMBLY_LIBRARY_LABOR_RATES.md. The separate `changed-files.json` lists every patch file exactly.

## Read-only staging comparison

At approximately 22:23 UTC, the connected Supabase tools identified the persistent
`staging` branch of `northgate-hq-v2.0` as `fazfwzbuesvzhgodckiw`. Its identity also
matches the repository's environment-release documentation.

The bodies of all four existing functions below exactly match the baseline
`20260916173238_estimating_workspace_integration.sql` used to prepare this patch.
The comparison extracts dollar-quoted bodies and normalizes outer whitespace;
it does not claim the rendered CREATE FUNCTION headers are byte-identical.
Raw function definitions and ACL metadata are saved beside the patch as
`staging-assembly-functions.json`. No secrets or customer records were requested.

| Replacement signature | Return / default arguments | Intended definition changes | Staging execution boundary |
| --- | --- | --- | --- |
| `validate_workbench_structure(jsonb,boolean)` | `void`; `complete=false` | Validate new snapshots/overrides and rate mirror; retain structure rules | Invoker; postgres/authenticated |
| `save_assembly_library(text,jsonb,uuid)` | `assemblies`; `p_estimate_id=NULL` | Persist nullable assembly hourly override; retain atomic save, permissions, audit and stale checks | Invoker; postgres/authenticated |
| `workbench_handoff_pricing(jsonb)` | `jsonb`; no defaults | Resolve four-level rate instead of item/estimate-only rate | Invoker; postgres only, called internally |
| `approve_workbench_estimate_internal(uuid,text)` | `uuid`; `p_approval_note=NULL` | Same rate resolver; retain fractional hours before multiplication for version-1 documents | Definer; postgres only, called by existing guarded approval wrapper |

The prepared migration is
`supabase/migrations/20261012220350_assembly_library_labor_rates.sql`.
Staging has the existing `assemblies.division` and `component_groups` columns,
but no `labor_rate_override` column or `assembly_library_settings` table. The new
migration version is absent from its migration ledger. The older integration
version is also absent from that ledger despite matching function definitions;
do not infer missing behavior from imported/consolidated migration history.

Staging assembly read policies allow estimating or approval readers. Assembly and
component mutations require scoped `can_estimate`. The patch leaves those policies
unchanged. New settings SELECT uses the same scoped estimating/approval predicates;
UPDATE uses `can_edit_catalog` in both USING and WITH CHECK. Authenticated callers
receive SELECT/UPDATE table grants and the optimistic settings RPC. Anonymous and
PUBLIC grants are revoked. The trigger requires a signed-in scoped editor, prohibits
division reassignment and writes before/after audit atomically. Its definer function
is not directly executable by application roles.

The settings key is the existing division boundary (`Electrical`, `Construction`,
`Admin`), not a new organization/tenant model. Assembly loading is explicitly
filtered to the selected permitted division. Production schema/function definitions
were not compared in this bounded staging review; repeat the same comparison
against Production before any production approval.

## Defaults and snapshot behavior

The migration initializes each division's new default to the verified code default
of $75/hour and leaves existing assembly overrides NULL. It rewrites no estimate or
approval records and introduces no $67 default. No alternate configured library
default was found in the inspected code; staging does not yet have this settings
table. Any separately discovered configuration must be reconciled before rollout.

New estimates snapshot the default and have no explicit estimate override. New
library copies retain the assembly source ID and snapshot its optional override.
Legacy `rate` remains an explicit estimate override when normalized by the new UI;
existing item overrides are preserved, including zero. The `rate` field remains a
validated mirror of the estimate override/default snapshot for old document shape
compatibility. All new client calculations/reports and server approval/handoff use
the same hierarchy. Historical approved snapshots remain untouched.

Library refresh alone updates library previews, not estimate pricing. Explicit rate
refresh previews before/after totals; Cancel leaves the draft unchanged. Apply
updates inherited snapshots/current library cache but requires Save Draft for
persistence. Explicit overrides remain. Reset removes only the selected override,
revealing the saved next level. Missing/inaccessible source assemblies retain their
snapshot. Locked/submitted/read-only or approved estimates cannot refresh.

## Review defects corrected locally

1. Refresh Library followed by settings Save could retain a stale live-preview rate.
   Settings Save now updates both default snapshot and current-preview fields.
   A repeated refresh/save regression passes in headless Edge.
2. Applying a rate refresh now updates the displayed current default and library
   cache together with inherited snapshots; Cancel still changes neither.
3. The inherited-rate review exposed an existing approval precision difference:
   fractional hours were rounded to four decimals before multiplying. A fixture
   produced $177.54 approved versus $177.49 client/handoff. Version-1 approval now
   multiplies the unrounded hours and rounds money afterward. The legacy SQL branch
   and historical approvals remain unchanged. The new regression passes.

After these corrections: 300 named Node tests, isolated PGlite integration/rate
checks, isolated headless Edge rate UI checks and Vite compilation pass. The earlier
broad estimator UI regression also passed. The build uses development fixture
configuration and must not be deployed. Existing XLSX/chunk-size warnings remain;
no lint/typecheck scripts are configured. The refreshed patch is checked against
the baseline with `git apply --check --whitespace=error`.

## Actionable staging rollout, subject to approval

1. Integrate the patch into an appropriate isolated staging checkout, not the active
   Dropbox checkout. Recheck target schema/functions if rollout is delayed and
   preserve the reviewed pre-migration definitions and tested build reference.
2. Apply the prepared migration only to `fazfwzbuesvzhgodckiw` in the authorized
   staging rollout. Verify columns/defaults, ACLs, RLS and audit behavior there.
3. Build with staging-only Supabase/Clerk configuration, `VITE_APP_ENV=staging` and
   the staging base path from the environment workflow. Deploy only staging and
   require estimator users to reload before testing the new document format.
4. Use clearly labeled staging fixtures to check authorized/denied roles and
   cross-division denial; settings stale saves; save/reload/reset at all four levels;
   zero/invalid input; fractional-hour approval/handoff/report totals; cancelled and
   repeated refresh; locked estimates; and unchanged legacy totals/snapshots after
   changing library defaults. Confirm visible sources and mobile layout.
5. Request a separate production approval only after staging acceptance and the
   equivalent Production schema/function comparison.

Do not blindly roll back to the old estimator after creating version-1 estimates:
it ignores inherited assembly override snapshots and could display different prices.
Rollback must retain a hierarchy-aware build or pause estimating access pending a
forward fix. Do not undo the schema or rewrite saved estimates to simplify rollback.
