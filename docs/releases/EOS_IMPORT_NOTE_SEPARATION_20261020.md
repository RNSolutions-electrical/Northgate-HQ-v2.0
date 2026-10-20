# Staging imported-note separation rollout — 2026-10-20

Extends checkpoint 44d3871. Staging only; Production, access/authentication and held historical data are excluded.

Observation Notes now contain genuine note text only. A separate accessible [*] Imported marker uses the immutable import ledger. The quarter read contract includes original-source provenance and review status. CSV notes remain note text; Source stays separate. Both future import paths retain audit/source metadata without injecting a footer.

Cleanup requires an explicit signed-in preview and confirmation using normal EOS membership and the existing guarded observation writer. It proves the exact footer against the original immutable import audit, compares the complete observation and period revision again at apply, skips changed/ambiguous rows, and keeps exact actor-bound receipts. Private before/after snapshots and metadata support audited restoration; restoration skips subsequent changes. No observation is changed by applying either additive migration.

Rehearsal: scripts/verify-scorecard-note-cleanup-db.mjs covers original, generated-only, appended, blank and ambiguous notes; stale row skips; transaction rollback; exact retry; concurrent-safe restore; CSV round trip; future imports and EOS/private-table denial. Quarter database rehearsal passed. Tracked suite: 389 total / 388 pass / 1 pre-existing skip. Build passed (existing xlsx/chunk warnings). Local synthetic layout passed desktop 1366/1440/1920, effective 125/150/200% CSS viewports and 390px mobile, with separate imported markers. No customer data was put in fixtures or build.

Before rollout: 614 observations, 699 audit entries, snapshot 90. Private recoverable backup at task-4/historical-source/backups/staging-before-note-cleanup.json. Independent audit comparison identifies 612 exact footers and 82 genuine imported notes, plus 1 manual note. Actual cleanup counts must be confirmed from the signed-in receipt and readback.

Recovery: the original actor calls eos_scorecard_import_notes_restore_v1(cleanup UUID, fresh request UUID) through the authenticated client. It is a normal audited write, idempotent by request UUID, restores only unchanged post-cleanup records, and reports restored/skipped. Never replay through an admin database session. Preserve the backup and cleanup ledger. Deployment/cleanup receipts are recorded in the follow-up rollout checkpoint.
