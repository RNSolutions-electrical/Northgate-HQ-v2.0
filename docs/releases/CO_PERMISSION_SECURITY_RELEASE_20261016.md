# CO permission security release — October 16, 2026

Ryan authorized this bounded Production correction. Migration 20261016110939,
contract_adjustment_status_authorization, applied successfully at approximately
11:09:39 UTC. Post-release metadata verified at 11:09:48 UTC confirms financial
visibility and canonical action authorization precede every record return.
Authenticated execution remains allowed; anonymous execution remains denied.

Only set_contract_adjustment_status(uuid,text,text,timestamptz) changed. No customer
records, permissions, templates, tables or unrelated functions were changed.
Authorized unchanged-status retries still avoid postings, timestamps and audit writes.

Twenty isolated PostgreSQL/source checks passed with synthetic records, including
real template/individual-override resolution, real submission and financial approval,
credit/zero/revision postings, protected reads, stale and denied requests, failure
rollback and guarded forward/backout recovery. Detailed Production-derived recovery
snapshots and extended integration artifacts are retained locally on Ryan_Northgate;
they are intentionally not published in this repository update. The repository
includes the bounded migration, source assertions and manually authored synthetic
fixtures. PGLITE_MODULE enables its optional in-memory SQL test.

Scoped function recovery was verified by exact definition restoration, unchanged
owner/grants and unchanged synthetic data. The earlier physical-backup requirement
was scoped to the October 2–3 schema/data release; current working instructions do
not require a new full backup for this reversible single-function replacement.
No new physical-backup verification is claimed. Emergency backout reopens the issue
and requires separate approval; prefer a forward correction.

This commit builds directly on main a504f88a0562f2f960c43db85a656874d8452100 and does
not change frontend, v0.8.0 EOS or tax/card handoff guard code. No Netlify frontend
deploy is needed. Production verification used metadata only, with no customer
impersonation or restricted-row demonstration. No historical misuse is claimed.

Sync marker: CO-STATUS-AUTH-PROD-20261016-001.
