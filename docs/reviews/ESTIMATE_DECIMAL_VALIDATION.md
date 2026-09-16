# Estimate submission decimal correction

Production Mode; user authorized correction, commit/push and deployment.

## Cause and scope

Approval accepted ordinary leading/trailing decimals but the handoff numeric
helper rejected them. Carolina Retina Change Order #11 Version 2 contained
material price `.20` and labor hours `.04`. The correction replaces only
the helper's regex with approval's existing grammar. Explicit zero remains
valid; blank, negative, malformed, nonfinite, exponent and oversized inputs
remain rejected. No UI, role, permission, financial formula or workflow changes.

Migration: 20260916200942_workbench_decimal_validation.sql; production version
20260916201141. Internal helper remains inaccessible to anon/authenticated
direct callers; existing RPC permission boundaries remain authoritative.

## Verification

- 124 explicitly selected unit tests passed. Bare node --test also discovers
  the existing serve-estimating-test.mjs helper and failed on occupied port 5320;
  no server was stopped. Rerun scoped to test/ and tests/ passed all 124.
- Isolated PostgreSQL suite passed decimal acceptance/rejection, approved-then-
  submitted estimate, frontend/approval/handoff price parity and snapshot equality,
  plus existing permissions, stale writes and atomic audit tests.
- Live rollback-only decimal regression passed authenticated approval then draft
  CO ($8.48), exact line totals, retry idempotency, unchanged snapshot and no budget
  posting. Synthetic data/audits rolled back.
- Read-only Carolina Retina Version 2 validation returned $2,527.71, equal to its
  approved snapshot. Document and full snapshot hashes were unchanged.
- Helper ACL/search path/security mode unchanged; security advisors unchanged.
- Production-configured frontend build passed; no frontend source was changed.
  Existing bundle-size/dynamic-import warnings remain.

The user's actual estimate was not submitted, revised, edited or reapproved.
Ryan should retry Submit for review and follow the ordinary draft CO workflow.
Signed-in browser acceptance of that actual submission is not claimed.
