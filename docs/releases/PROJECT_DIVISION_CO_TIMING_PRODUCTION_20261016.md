# v0.9.4 — Project division CO attachment timing Production receipt

Production ledger `20261016211525`, migration `fix_project_division_co_attachment_timing`, applied 2026-10-16 at approximately 21:15:25 UTC. Source: `supabase/migrations/20261016204812_fix_project_division_co_attachment_timing.sql` (upstream a73ba84c7d122c4ea833c2d5e836d36c408006e2; local c6480fd). Only the existing attachment trigger timing changed from BEFORE INSERT (type 7) to AFTER INSERT (type 5), enabled O.

Verification snapshots 21:15:11.952033 and 21:15:36.131266 UTC: complete canonical row hashes unchanged for jobs, project divisions, budget lines, revenue lines, financial baselines and change logs. Attachment/ensure/catalogue/batch/authorization function definitions, owners and ACLs exactly unchanged. The parent FK remains validated and nondeferrable. No frontend deployment or actual template application occurred.

The independent scoped relationship repair has NOT executed. Its reviewed preservation SQL from 3fd5be9c5d190ef5823f27e97ba15970c82e8908 is locally preserved at e8d1dec. SHA-256: B0A3FB4BC066219CBB00B8B810C136A40BF63D01B85EA30EB8C25C4B204BD78D.

Independent local reruns passed in PGlite 0.5.9 and disposable PostgreSQL 17.10: 12 ordinary-trigger label rewrites reproduced; all 116 synthetic links audited with exact original-field preservation; forced restoration failure rolled back parent/link/audit/baseline changes; stale/repeated and noncanonical inputs rejected; unauthorized actor rejected; second concurrent transaction waited then rejected changed setup. Disposable server stopped.

Execution blocker: the connected Production administrative SQL session is postgres with null authenticated subject and null request.jwt.claims. The reviewed repair requires a genuine verified active application actor with existing job approval, line and protected-financial permissions. No actor claims were invented and no permissions changed. Existing human approval remains valid; the missing prerequisite is actor context through the supported release workflow.

Private scoped full-row before-state, linked financial records and timing fingerprints are retained only under ignored .temp/co-production-repair. Refresh them and revalidate the reviewed mapping immediately before any authorized repair execution. This public-safe receipt contains no customer identifiers or financial details.

Release verification: all 354 explicitly enumerated repository tests pass with zero skips. Independent timing regression passed in PGlite and PostgreSQL 17.10. This release includes only the timing source, its synthetic regression harness and sanitized Staging/Production receipts; scoped data repair preparation and private snapshots are excluded. All publication commits use [skip ci] because the deployed frontend does not change. The existing ready Production frontend remains Netlify 6ad28722f48eddc8eb974f91, application dc2de6d17c4259e169a787b20dfa0169515092b6 (v0.9.3).

Publication completed: immutable annotated v0.9.4 peels to 9ba3967361dc49191ca8d41965ee17c0970d1b79; GitHub Release 415389362 was published at 2026-10-16T21:20:34Z: https://github.com/RNSolutions-electrical/Northgate-HQ-v2.0/releases/tag/v0.9.4. Remote main was verified at the same source commit before this documentation receipt. The existing ready Production frontend was independently rechecked at its unchanged deploy/application IDs above. No customer-specific repair artifacts were published.

Recovery: do not restore the old BEFORE trigger as a routine rollback; it reintroduces the FK failure. Use a reviewed forward correction. No data repair recovery is needed because no repair ran. Frontend stays at v0.9.3.
