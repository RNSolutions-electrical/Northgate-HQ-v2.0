# Service Calls — combined workflow and import preview
Date: 2026-09-14 · Production Mode · Released: CEDAR-SERVICE-PROPOSAL-20260914-001
Feature commit: `23c2e9c`. Production deploy: `6aa7eb647db05775d8eab870`.
Original local checkpoint: SERVICE-LINK-20260914-001.

## Scope and decisions
- Reuse canonical Jobs with job_type=service_call and the existing svc_* tables.
- Keep regular Jobs / SOV / Pay Apps unchanged.
- Link split/follow-up calls using the existing related_job_id relationship. Circular links are rejected.
- Archive, rather than delete, calls. Archived calls retain invoices, payments and links.
- Shared invoices allocate revenue/tax per call. Each call's profit and balance use only its allocation.
- Historical spreadsheets are preview-only. No history was imported and no spreadsheet was changed.

## User workflow
Jobs > Service Calls > Create Service Call or open an existing call.
Details tracks number, customer/contact, address, scope, lead, service date, work stage, notes, billing method and related call.
Costs & Billing tracks estimated/quoted amount, approved changes, cumulative cost snapshots, issued invoices and payments.
Supported billing methods: T&M, quoted, T&M + quote, and the existing warranty/no-charge method.
Mark work complete before recording an invoice. For shared billing, add completed calls and allocate the pre-tax invoice total exactly.
Tax is allocated proportionately with deterministic cent reconciliation. Payments record only that call's share, including tax.
Existing Assignments, Documents, Transactions, Schedule and History remain reachable from the call.

This records invoices already issued through the billing system. It does not generate/email invoices or synchronize an external accounting application.
Costs are cumulative snapshots, not additive entries; the form explains this. Missing costs produce no invented profit.
Numbers are entered explicitly and checked for existing duplicates. Automatic next-number assignment is deliberately not inferred from incomplete historical data.

## Sources and preview
Inspected:
- NEW Electrical Scorecard 2026.xlsx > All Service Calls (headers at row 4).
- SERVICE WORK JOB NUMBERS NGG > Job #s (headers at row 3).
The app accepts XLSX/XLS/CSV exports. It reads these files in the browser and compares normalized job numbers with visible existing calls.
The preview preserves both sources and flags duplicates, conflicting names/addresses/scopes/contact details, single-source records, archived matches, shared billing notes, formula errors, possible ordinary projects and historical billing ambiguity.
It does not execute spreadsheet formulas. Cached values are used; missing/error results need review.
A blank billed date does not acquire a fabricated due date from the workbook's date formula.
Actual workbook parsing found 58 numbered rows; 28 required billing review. Some may be placeholders or non-service jobs. These are not approved import counts.
No import/merge write RPC exists in this release. Preview suggestions do not overwrite records.

## Database
Migration: supabase/migrations/20260914114401_service_call_workflow.sql.
Created with the CLI, then filename aligned with the verified production migration version. Applied to keogysnoukbendfkfjcn.
- Extends svc_service_profiles with customer/contact, service date/lead, work stage, quote and changes fields; extends billing method constraint for mixed billing.
- Reuses existing parent-call foreign key and index.
- Adds svc_invoice_groups for atomic, idempotent shared-invoice headers; svc_invoices remain per-call allocations.
- Adds invoice-group FK/index, unique invoice number, invoice due date and payment request UUID uniqueness.
- Adds unique normalized service_call_number index.
- RPCs: svc_read_calls, svc_save_call, svc_save_commercial, svc_post_invoice, svc_archive_call.
- Pure private validator: svc_validate_money (finite amounts, exact cents, range).
- Reuses current_user_can_access_job/current_user_can_edit_job and existing job creation.
- Financial read requires can_view_project_financials. Financial write requires can_approve_budget and project access.
- Operational edits require can_manage_jobs; creation reuses can_create_jobs; archiving also requires can_archive_records.
- Masked RPC reads do not return quotes, costs, invoices, payments or financial audit details to operational-only users.
- Direct commercial table writes are revoked; invoice-group table is RPC-only with RLS.
- Existing cost-edit RPCs now require financial edit authority. Unused direct visits/labor writes cannot inherit financial read authority.
- Existing Scorecard view keeps its shape; tax is included in outstanding balance, excluded from revenue/profit.
- Audits retain authenticated actor/name and timestamps. Financial values do not enter operational job-detail audit payloads.

No original budgets, SOV, Pay Apps, regular Jobs or permission defaults were altered.
Preflight found zero service profiles/cost snapshots/invoices/payments, and no duplicate service-call numbers.

## Integrity and verification
- npm test: 38/38 passed (8 Service Calls tests).
- Rollback-only integration test: tests/serviceCallsWorkflow.sql ran successfully on the production schema using synthetic actors/calls.
  Verified creation, links/cycle rejection, duplicate number rejection, stale edits, quote/cost saves, invalid currency rejection,
  two-call revenue/tax reconciliation, invoice replay, payment replay, overpayment rejection, unbalanced/stale/incomplete-call invoice rejection,
  full failed-post rollback, operational-user financial masking/RLS/write denial, actor display-name audit, archive retention and grants.
- Post-test checks: zero synthetic jobs/users and zero invoice groups/invoices remain.
- scripts/verify-service-calls.mjs: desktop/tablet/phone interaction and layout fixture. Covers edit/link, invoice allocation/confirmation, archive, read-only controls and resource navigation.
- Existing scripts/verify-financial-workflows.mjs passed, including ordinary Jobs budget edits, protected reasons and failed-save retention.
- Actual two-session concurrency/load testing and authenticated live browser acceptance have NOT been run.
- Security advisors: 152 findings (147 pre-existing + 5 expected authenticated SECURITY DEFINER RPC notices). The five new APIs intentionally use existing controlled RPC conventions, deny anonymous access, validate scopes and lock relevant records. No new unprotected table or mutable-search-path warning.
  Reference: https://supabase.com/docs/guides/database/database-linter

## Build / release status
The bare local build lacked Supabase/Clerk environment variables and would produce an unusable bundle.
vite.config.js now stops the build if these are missing.
Netlify's local build failed during npm ci because Windows locked node_modules/.bin. Pinned dependencies were restored with npm install; package-lock.json was unchanged.
A configured full build passed using only existing public client configuration from a previous production artifact (no secret keys).
Combined release artifact: dist/assets/index-z6h1fAaw.js. Its contents were checked for the new RPCs/import preview and the correct Supabase project URL.
Both frontends are committed, pushed and deployed. Live HTML/JS/CSS hashes match the tested build. All 43 current unit tests and responsive fixtures pass. Automated sign-in reached the account service but encountered its Cloudflare bot check; real authenticated acceptance remains required.
Existing untracked dist-* directories were preserved.

## Remaining acceptance / follow-up
1. Test a real service call in the published frontend with the intended roles.
2. Review preview matches, regular-job exclusions and proposed shared-invoice allocations before designing/approving historical import.
3. Confirm historical number sequence before automatic number suggestions are introduced.
4. Controlled invoice/payment corrections or reversals and archive restoration are not included; ordinary posted ledger edits/deletes are blocked.
5. Preview reads exports of Google Sheets, not a continuously synchronized Google account connection.
