# Blank-slate budget adjustment follow-up

Local candidate only; no follow-up migration or deployment applied remotely.
Base: staging 50f11ff346f7b76e4e31f945d93867bed4d961ad.

Hosted smoke testing found that a standalone negative margin target violates the existing job budget and forecast nonnegative constraints. The first SQL fixture used a single combined cost-code target, and therefore did not cover this mapping.

The local migration preserves every existing financial constraint, source cost and signed allocation. Blank-slate positive allocations post before negative adjustments across all work items. Thus a later positive margin can fund an earlier negative margin on the same explicitly selected target without temporary constraint failure. Under the existing per-job lock, each negative posting checks both locked original budget and forecast balances and raises an actionable validation error when either would become negative. The transaction retains existing permission, stale revision, idempotence and audit rollback behavior. Legacy estimates retain their one-pass behavior. No historical record is rewritten.

Supported accounting options: explicitly map signed adjustments to an existing funded margin line, or explicitly combine positive and negative allocations on one nonnegative target. The immutable allocation ledger keeps source material, hard labor and signed selling adjustment separate even when the target is combined. There is no silent remapping, clipping, redistribution or source-cost reduction.

A brand-new standalone negative budget line remains impossible under the preserved constraints. Supporting that requires an agreed new financial representation such as a dedicated contra-budget adjustment ledger and corresponding financial totals/exports, which is outside this local correction. The candidate returns a clear rejection instead of a raw CHECK-constraint failure.

Validation: isolated actual PostgreSQL mapper suite passes with the real nonnegative budget and forecast constraints now installed in its fixture. Added separate-target tests cover rejection/rollback with no job, handoff, allocations or audit residue; funded negative margin with immutable direct costs; insufficient forecast rollback after earlier positive postings; stale revision denial; duplicate retry with unchanged balance/audit; later-work-item funding of an earlier negative adjustment; exact-cent reconciliation 100.03 total / 90.02 margin. Existing approval, 120 four-item SQL/JS pricing parity cases, tax/card safeguards, service-call and injected audit rollback tests remain passing.

Ready for a narrow staging follow-up migration, subject to normal fresh head/preflight/isolation verification. No production operation or changes to financial constraints are required. It does not claim support for a new standalone negative budget target.

Release checkpoint: guard applied only to staging as 20261116032938_blank_slate_budget_adjustment_guard. Hosted read-only verification confirms the two-pass mapper and actionable guard, with both budget and forecast nonnegative constraints unchanged. Client/source publication and hosted synthetic guard smoke check follow.
