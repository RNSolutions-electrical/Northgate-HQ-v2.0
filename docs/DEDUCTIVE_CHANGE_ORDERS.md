# Deductive Change Orders

Negative component amounts represent deductions. Mixed additions and deductions
are allowed in one Change Order. Price is the signed sum of all components;
cost is that sum excluding markup. Draft totals and client print/PDF retain signs.
Zero-total orders still cannot be submitted. Nonfinite monetary values are rejected.

Submit saves the latest editable draft first and stops if saving fails. Signed
client authorization, verification, decision certification, permissions and audit
requirements are unchanged. Approved financial postings retain the existing
line-total mapping and revision delta calculation; no original budgets are rewritten.
Calculated Current Budget reflects signed postings. A manual Current Budget override
remains fixed until changed or reset. Forecast and Actual values are not rewritten.

SOV allocation accepts signed nonzero amounts summing exactly to the approved price.
Original SOV and billed-to-date nonnegative constraints remain unchanged. Existing Pay
App sync and percentage calculations already preserve deductive CO values. This does
not issue a customer payment/refund or alter a finalized bill automatically.

Migration `20260906200342_deductive_change_orders` changes monetary validation and
draft/submit/allocation functions. It also removes the obsolete two-column posting
unique constraint, retaining uniqueness by order, line and posting kind, so void
reversals can coexist with approvals. Allocation and void audits use supported
create/update actions; before/after state and reasons remain recorded.

## Verification

- `npm test`: 19 tests pass; production build and diff check pass.
- `node scripts/verify-deductive-change-orders.mjs`: real ChangeOrderWorkspace with
  mocked transport, desktop/tablet/phone input, totals, save/reopen, submit latest
  draft, failed-save blocking, client PDF credit and read-only controls pass.
- `tests/deductiveChangeOrders.sql` runs only inside BEGIN/ROLLBACK. Before and after
  migration: signed/mixed values, NaN rollback, submission, missing authorization
  rejection, signed approval, idempotent posting, SOV credit, Pay App credit,
  revision delta, void reversal, positive regression, zero rejection, denied caller
  and audit checks pass. No fixtures retained.
- Security advisors unchanged: 143 existing findings, no new findings.

## Acceptance

1. Refresh and create a draft for deleted fixtures with negative material/labor/markup
   as applicable. Confirm the displayed total, then save and reopen it.
2. Submit and export for signature. Confirm the PDF shows the negative amount.
3. Through the usual signed-document approval process, check the deduction against
   the intended financial line. Include it in an editable Pay App only when appropriate.

Existing billing treatment of multiple approved revision records is not changed by
this release; the billing sync sums approved records. Review supersession/delta
treatment before billing both an original and its replacement revision. Full refund
processing and retrospective finalized-bill corrections are outside this change.
