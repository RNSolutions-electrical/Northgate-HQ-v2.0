# Central financial catalogue and project naming — approved Staging scope

Ryan approved implementation and Staging deployment on 2026-10-19. Master editing remains Developer-only; job-only custom lines remain allowed and clearly marked. Name overrides are separate from current-budget monetary overrides. No Production code/schema/data action is authorized.

## Dry-run mapping before implementation

Read-only isolated Staging inspection: 177 active catalogue entries, 12 distinct financial division codes with one name each, 24 active job divisions and 354 active budget lines. All 354 have one exact case/outer-whitespace-normalized catalogue code match; all stored descriptions exactly match the corresponding catalogue description. All 24 division names match their corresponding catalogue name. No ambiguous/unmatched Staging rows require a business mapping decision. Exact IDs, source timestamps, metadata and before fingerprints are held locally in ignored `.temp/catalogue-dry-run.json`.

The verified Division 07 catalogue alias is canonicalized when creating the single master division and its master top-line label. Existing job strings/amounts are not rewritten; the operational resolver inherits the master through additive links. Future master names come from the database rather than a hardcoded map.

Production is inspection-only: 644 active lines; 608 exact catalogue code matches, 35 unmatched, one blank; 168 matched descriptions and 423 matched categories differ; 335 lines lack a project division link. These are not automatic corrections. Production backfill/promotion is excluded. Existing category, split-line and financial allocation semantics must be retained.

## Implementation contract

- Reuse `financial_line_catalogue` UUIDs and add a normalized master financial-division table. Add nullable master references and nullable name overrides to existing job entities. Preserve original job text as compatibility/history; resolve master names plus explicit local overrides for current operational display and new reports.
- Manager supports search, add, edit, retire/reactivate, optimistic version checks, full before/after audit. Additions make codes available; they do not create rows across jobs. Used codes/division/meaning cannot be silently changed or reclassified.
- Job Financials provides inherited name, visible override and master original, edit/reset. Financial approvers apply through existing job financial bounds; contributors retain existing proposal/review application. No new business rank, credential or broad permission grant.
- Resolve referenced retired names only inside existing authorized job financial scope; active global catalogue reads and Developer retired reads retain their existing bounds. No general retired-catalogue visibility expansion.
- Name-only edits do not change code, identity, financial amounts, categories, project assignments, billed history or existing snapshots. Group/collapse keys use stable identity rather than effective text.
- Existing manual/import/template/handoff/CO creation paths acquire stable links without mass job updates. Explicit job-only custom entries do not enter the master. Keep legacy inventory `cost_codes` separate.
- Preserve issued documents, historical audit text, billed Pay App snapshots and approved estimate snapshots. Newly generated current reports record effective names; live metadata edits never rewrite old snapshot content.

## Implementation checkpoint

The existing financial proposal contract validates bounded line JSON and applies through `save_job_financial_batch`. Naming-only line changes will extend that guarded contract; division naming is carried with the representative accessible job line and an expected division version, preserving contributor review and baseline concurrency. Existing financial RPC logic and authorization checks must remain intact.

Staging rows can receive the validated unique master links without new divisions/CO helpers. Backfill updates are metadata changes: existing timestamp/baseline triggers stay enabled, and their resulting concurrency token changes must be recorded/verified. No trigger or audit bypass is part of the plan.

Migration source must be CLI-generated and rehearsed in a disposable local PostgreSQL cluster before Staging application. Verify rollback on preflight failure, unauthorized/stale/structural edits, full amount/identity/category snapshots, no helper-row inserts, and before/after RLS/advisor changes. Complete repository and browser regression checks before publishing code. Existing ready display patch and all unrelated Staging changes remain preserved.

## Final validation and refreshed Staging data

During validation Ryan added `Toro Test` in Staging. A fresh read-only mapping inspection found 531 active lines and 36 divisions across three Staging jobs. All 531 still have exactly one catalogue code match and identical copied descriptions; no unmatched or ambiguous mapping decisions arose. The original 354-line dry-run is retained separately. Final migration rehearsal uses the refreshed complete mapping and preserves the newly added job.

The exact SQL passes nine disposable PostgreSQL 18.4 scenario groups: complete preflight rollback, mapping/financial/history integrity, Developer and job-scope bounds, master/line/division stale writes, inheritance/override/reset, retirement/reactivation, successful and stale import, the actual existing reviewed-application wrapper, authenticated grant denial, direct naming-audit bypass rejection, and real two-connection races. Existing financial fields of every original row compare byte-for-byte after the entire scenario sequence. Legacy unlinked rows resolve a unique existing job division override without creating a physical project link. Permission helpers and the generic v5 substrate are synthetic in this local rehearsal; existing authorization rules are reused unchanged.

Final explicit aggregate: 367 tests, 366 pass, one skip, zero failures. Synthetic Staging-identity build and `git diff --check` pass. Browser fixtures block external requests: catalogue manager and job name overrides/reset on desktop/phone; 40 Remaining Budget/label groups on desktop/tablet/phone; seven Add Line groups; existing financial override/protected-reason/contributor workflows; and the preserved estimate review scrolling regression pass. Screenshots are visually reviewed. Local navigation timeouts were raised to accommodate Vite's initial dependency compilation; assertions and server validations remain enforced.

New current financial exports and CO selection/default labels use effective names. Existing customer-facing billing lines, issued Pay App snapshots, historical files and prior audits remain stored as they were. Name-only proposal review explicitly shows the proposed name rather than misleading zero-valued amount summaries. No forecasting changes, financial transfers, balancing rows, new CO postings, legacy inventory-code merge, Production action or permission-rank change is included.
