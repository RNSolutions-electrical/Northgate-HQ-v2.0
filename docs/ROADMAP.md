# Backlog

## Recovery / weekly backups — deferred, required before broader beta promotion

Ryan reaffirmed on September 22, 2026 that backup options should be decided
later, but must not be forgotten. Before adopting the full release/promotion
workflow or relying on it for business-critical data, revisit database **and
Storage-file** recovery, actual Supabase backup/PITR availability, offsite
destination, approximately eight weekly recovery points, costs, alerting, and
an isolated restore drill. See
`reviews/ENVIRONMENT_RELEASE_PHASE1_CURRENT_STATE_20260922.md`.

This is a tracked decision gate, not authorization to schedule, export,
purchase, restore, or modify Production backup settings now. Existing
per-object permanent-deletion backup safeguards remain in place.
