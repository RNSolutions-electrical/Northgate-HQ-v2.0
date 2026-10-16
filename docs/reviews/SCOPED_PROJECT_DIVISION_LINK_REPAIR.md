# Scoped project-division link repair — preparation only

This is a reviewed execution template, not a migration or an automatic repair. No target/customer identifiers, real amounts or private mapping manifest are embedded in these repository files. A release owner must bind a freshly reviewed private manifest and verify authorization before any live execution. Preparing this artifact does not authorize execution.

Exact SQL: `scripts/repair-project-division-links.sql`. Regression module: `scripts/verify-project-division-link-repair.mjs`, invoked through the existing isolated SQL harness with `CO_REPAIR_TEST=1`.

## Preservation strategy

The ordinary division ensure trigger synchronizes a numbered CO line's description and note to catalogue-derived text. A relationship-only repair cannot leave those changes behind. The SQL therefore:

1. Requires an authenticated, active actor with actual job approval and line/protected-financial access. Requires normal enabled triggers, the corrected AFTER attachment trigger and the immediate validated parent FK. It never changes functions, grants, RLS, constraints or trigger enablement.
2. Locks the single selected job and all its financial rows, then checks the freshly supplied full-row fingerprint, active count, exact approved prefix counts and zero-existing-division setup. Stale/different setup aborts rather than expanding scope.
3. Snapshots every original field, existing audit IDs and unrelated financial rows. Creates only the manifest's project-division instances using the uniquely supported active catalogue names. Existing numbered CO IDs must be reused.
4. Records explicit null-to-instance CO-link audit entries from the original snapshot; it does not remove the ensure trigger's temporary label-sync history.
5. Uses `save_job_financial_batch` with a meaningful reason and current `expected_updated_at` values. Each payload contains only the existing ID, target project instance and original description/cost-code/note. This restores trigger-modified labels/notes and assigns the remaining numbered links through the ordinary permission, stale-check, protected-field and audit path.
6. Before commit, compares every original row field byte-for-byte except the approved division link and normal update timestamp. Nonnumeric-prefix and archived lines must match completely. It independently verifies each financial-column total, no row additions/deletions, exactly one original CO per approved prefix, no outside-job financial changes, and current-transaction before/after audit coverage for every link. Any failure rolls back the entire transaction.

The financial RPC trims descriptions and cost codes. To avoid silently changing noncanonical source bytes, this template refuses leading/trailing whitespace or empty descriptions in numbered rows. If that precondition fails, stop and prepare a separately reviewed exact-byte approach; do not normalize the records merely to get this script through.

## Release-owner binding

The SQL reads these required **session** settings, which must be established through the existing supported authenticated/privileged release workflow before running its BEGIN/COMMIT wrapper:

- `request.jwt.claims`: genuine verified authorized actor context; never invent an actor or expand permissions.
- `northgate.repair_job_id`: exact approved project UUID.
- `northgate.repair_expected_lines_hash`: fresh full-row hash for **all** that job's lines, including archived rows.
- `northgate.repair_expected_total`: reviewed active-row count.
- `northgate.repair_prefix_counts`: reviewed JSON object mapping numeric prefixes to active-row counts.
- `northgate.repair_reason`: explicit controlled-correction reason.

Fingerprint query (parameterize the approved job ID):

```sql
SELECT md5(coalesce(string_agg(md5(to_jsonb(l)::text), '' ORDER BY l.id), ''))
FROM public.job_budget_lines l WHERE l.job_id = :job_id;
```

Retain the fresh manifest, complete scoped before-state snapshot, exact SQL SHA-256, actor, approval evidence and resulting receipt privately. Supply only the approved numbered-prefix mapping; unresolved generic lines remain unchanged. Do not run Build from Template as a substitute for this relationship-only correction, because template alignment intentionally has broader metadata effects.

## Synthetic verification

Fixture has 119 target lines, 12 CO lines with deliberately different original descriptions and notes, distinct nonzero monetary vectors, protected flags and nullable overrides, plus an unrelated job. All labels, values and per-prefix distribution are synthetic. Local PostgreSQL 18.4 tests cover:

- All 12 ensure-trigger description/note rewrites reproduced, then rolled back.
- Exact repair SQL preserves original descriptions, notes, all monetary values and every other non-link field; generic and unrelated rows remain untouched; all 116 changed links have explicit current-transaction audits.
- Rejected restoration through an ordinary enabled trigger rolls back parent creation, links, temporary labels/notes, audits and baseline versions.
- Repeated stale-plan execution and noncanonical text are rejected without changing data.
- Unauthorized actor is rejected before repair.
- Two real PostgreSQL transactions: second waits on the job lock, then rejects the now-changed plan after first commits. No duplicate divisions/CO lines or original-field changes.

Use a fresh dedicated synthetic PostgreSQL cluster only:

```text
CO_REPAIR_TEST=1
PG_TEST_URL=postgresql://synthetic_co_test@127.0.0.1:<test-port>/<test-db>
PG_MODULE=<installed pg/lib/index.js>
node scripts/verify-project-division-co-timing.mjs
```

The harness creates/truncates synthetic schema tables and refuses remote hosts or a username other than `synthetic_co_test`. Never point it at an existing application database or a forwarded live connection. Auth helpers are synthetic in this destructive local fixture; actual Staging evaluator/ACL evidence is recorded in the timing-migration release receipt.

## Recovery and limits

Before commit, every failure is an all-or-nothing rollback. The emitted receipt contains the actor/reason, created/link/audit counts, and equal before/after monetary-column totals. After a successful live correction, retain that receipt and the full private snapshot. If any later issue is found, stop affected writes and prepare a scoped audited forward correction against current row versions; never erase audit entries, restore a whole database, or overwrite subsequent financial activity.

No Production or actual customer records were changed while preparing/testing this artifact. It is on a separate preparation branch; no Staging/main branch update or deployment is part of this handoff.
