# E.O.S Project Pursuit Tracker — development handoff

Status: deployed to isolated Staging on October 8 at commit `4152f709`.
The migration was rehearsed on a disposable Production-backup restore, applied
to Staging, and the workbook imported. Initial signed-in browser and access
checks passed; full owner acceptance is still pending. Production remains
unchanged. Do not include this feature in the pending Staging → Production
team-release promotion until its own acceptance checks are complete.

## Scope

- `/eos` has the full Entrepreneurial Operating System heading, the Project
  Pursuit Tracker, editable client contacts and leadership reminders. Go/No Go
  Tracker and Company Scorecard are honestly labeled Coming soon.
- Entry is limited to an explicit `eos_access_grants` row **and** an active
  Manager/Director business rank. Technical Developer access by itself is not
  sufficient. RLS and security-definer RPCs enforce the same boundary as the
  route. Access is managed in Developer → Access Control by an actor with both
  Director business rank and Developer authority.
- The October 6 owner-approved initial emails are Ryan Noel, Eric Brinker,
  David Wright, Tim Brixey, Jason Green and Rick Joseph at their
  `@thenorthgategroup.com` addresses. Migration grants only matching, active
  Manager/Director accounts. A read-only Production check on October 6 found
  matching accounts only for Ryan and Tim. David, Jason and Rick have unlinked
  employee profiles; Eric had no matching profile. Do not invent or elevate
  those four. Grant them in Developer → Access Control after their real accounts
  exist and have the proper business rank. A read-only October 6 Staging check
  found `Ryan@thenorthgategroup.com` with `User` business rank. On October 8,
  Ryan approved `CRNCMK@gmail.com` as the temporary Staging-only EOS tester.
  It is an active Director with Developer authority; the audited EOS grant
  was applied without changing either account's business role. The ordinary
  Ryan account remains an ungranted User for denial testing.
  The current account-provisioning RPC does not explicitly carry an employee
  profile's business rank into `user_permissions.business_role`; verify the
  canonical rank after first sign-in and set it through the existing permission
  console if appropriate. EOS does not silently alter the broader auth model.

## Data and workflow

- New `eos_clients`, `eos_pursuits`, `eos_pursuit_managers` and
  `eos_leadership_reminders` tables live in
  `20261006130000_eos_pursuit_foundation.sql`, with read/write RLS, audit triggers,
  date derivation and source provenance. Routine deletion is a recoverable
  soft-delete with inline Undo; hard DELETE is not granted to app clients.
- `eos_save_pursuit` updates the pursuit and manager association in one
  transaction. `eos_award_pursuit` locks the pursuit, uses the existing Job
  creation permission/function or verifies access to an existing Job, then
  links it exactly once. Planning value never posts to Job financials.
- The active/default pipeline excludes Dormant, No Go and Awarded records.
  The four overview cards use source scope only; search and manager filters
  narrow the table. Strictly greater than 50% controls the third card.
- The original workbook remains untouched. `workbookSeed.json` is the supplied
  normalized extraction. `scripts/import-eos-workbook.mjs --dry-run` reports
  33 General + 8 Electrical rows and unresolved manager/client/job mappings.
  The import is staging-only and idempotent by source sheet + row. `--apply`
  requires `EOS_STAGING_URL`, `EOS_STAGING_SERVICE_KEY` and
  `EOS_EXPECTED_STAGING_REF`, which must exactly match the staging project.
  Never place the service key in a commit, browser bundle or console output.
  Run the import only after the Staging migration is rehearsed and applied.
- The package's first quote source link was replaced with a direct Echelon
  Front article; the second quotation follows Echelon Front's punctuation and
  cites its explicit Jocko Willink/Leif Babin attribution. Original reminders
  remain clearly labeled as paraphrases. Seed keys make the set idempotent.

## Validation and promotion gates

Completed locally: 12 EOS logic/canonical permission tests, 41-row dry-run,
and a compile-only Vite build with placeholder environment identifiers. These
do **not** constitute a database rehearsal or signed-in browser acceptance.

October 7 rehearsal attempt: Ryan approved a temporary schema-only Supabase
branch at the displayed $0.01344/hour rate. Branch
`eos-migration-rehearsal-20261007` (`cxvarreitnkujlafhadi`) was created without
Production data or Git sync. Read-only inspection found that it lacked the
Northgate `user_permissions`, `jobs`, and `change_logs` tables, so applying the
EOS migration there would not test the real dependency graph. The branch was
deleted and its absence verified; Production and Staging were not changed.
The next safe rehearsal route is a temporary **restore to a new project** from
the latest Production backup, which copies real data and needs separate owner
approval and a cost check before creation. Do not mistake the empty branch
attempt for a passed migration test.

October 7 follow-up: Ryan separately approved a temporary restore. Project
`northgate-eos-rehearsal-20261007` (`knbafigwlkvukjqsmydo`) was restored from
the October 7 07:37 UTC Production backup at a displayed $10.18/month while
active. It contained the required Northgate schema. The EOS migration applied
there; the rollback-only SQL smoke test passed after correcting fixture naming
ambiguities and separating side-effecting checks. The test covered grants,
Manager/Director and technical Developer boundaries, direct-write denial,
client/pursuit audit, dates, multiple managers, delete/undo, award to existing
Job, award creating a new Job, retry idempotence, and no budget posting. It
left zero fixture users, pursuits or clients. The conditional seed granted
only the eligible Ryan and Tim Production accounts in the temporary copy;
six reminder rows were seeded. No live database was changed.

The rehearsal found that Supabase default privileges allowed direct writes
until explicitly revoked. The migration now revokes all default grants on EOS
tables before granting only intended operations. It also restricts trigger
function execution and fixes `eos_touch` search-path mutability. Security
advisors now show only expected EOS notices: `eos_access_grants` deliberately
has no RLS policy because no app role has table privileges, and authenticated
users can call the guarded SECURITY DEFINER RPCs by design. Unrelated inherited
schema advisor findings remain outside this feature's scope. Ryan approved
deletion of the temporary restore. It was deleted October 7 at 09:57 EDT;
Supabase displayed a successful deletion notice, and a fresh project listing
confirmed `knbafigwlkvukjqsmydo` absent with Production
`keogysnoukbendfkfjcn` still healthy. The optional exit-survey submission
failed, but project deletion succeeded. No temporary rehearsal project remains.

October 8 Staging application: migration `20261008104622_eos_pursuit_foundation`
applied to isolated Supabase branch `fazfwzbuesvzhgodckiw`; rollback-only SQL
smoke passed. The approved `CRNCMK@gmail.com` grant was made through the
audited `set_eos_access` RPC. The supplied workbook was imported with service
role context through the Supabase SQL connector: 29 distinct source clients,
41 unique pursuits (33 General, 8 Electrical), and six reminders. A repeat
import inserted zero clients and zero pursuits. Eight pursuit rows had no
source client. Five source job numbers did not match Staging Jobs, so they
remain preserved as original labels and unlinked; no Job budget was posted.
Source manager initials and ambiguous client labels were not guessed or
auto-mapped. The repo import script still requires a Staging service key for
its own `--apply` path; the connector route avoided exposing such a key.

October 8 Staging deploy: code commit `4152f709025157f90d07c64152d13bd7c3d71c88`
was pushed to `origin/staging` and published by Netlify deploy
`6ac775bfc21f82000804ffc6` at 06:51:59 EDT. The signed-in
`https://staging.rnsolutions.net/eos` page displayed the Staging banner,
41 imported pursuits, client choices, and leadership reminder. Opening and
cancelling New Pursuit and narrowing/clearing search worked without changing
records. Focused EOS/auth/environment tests passed 16/16; a Staging-identity
Vite build passed. In rollback-only Staging JWT checks, the temporary
`CRNCMK@gmail.com` Director tester had EOS access and the ordinary
`Ryan@thenorthgategroup.com` User did not. The broad npm auto-discovery run
stalled on a Vite cache lock and was stopped without assertion failures.

October 8 refinement: commit `b8e30075839d0b1a3c80a7c088c1b6edd174f8d8`
was published to Staging by Netlify deploy `6ac78f6f031acd00084e3ee4` at
08:41:36 EDT. Tracker rows now gain a stronger hover and keyboard-focus
background while retaining Go/No Go tint. The fourth pipeline card remains
Awards; the probability card now reads “Pursuits / Estimates >50%” and counts
both active phases above 50%. Awarded records leave that card and remain in
Awards. The card's click filter uses the same shared predicate as its total.
Seven focused EOS tests and a Staging-identity Vite build to a fresh temporary
output directory passed. The usual local `dist` cleanup was blocked by an
existing file lock, so the fresh output directory avoided touching it. No
schema or data migration was needed. Ryan visually accepted the refinement
on October 8.

October 8 signed-in UI follow-up: a clearly labeled temporary QA pursuit was
saved with only its name, then edited to an Estimate with a $1,000 planning
value, 75% probability, discussion and initial meeting. The 7-day and 2-week
dates derived as October 15 and 22. The active estimate and >50% card totals
each rose by one and $1,000, and the >50% card narrowed to the two matching
rows. An inline discussion edit persisted. Changing the QA estimate to
Dormant removed it from the active metrics, and the Dormant view showed it.
The award handoff UI showed existing-Job and new-Job options; it was cancelled
without creating or linking a Job. Reminder management listed six enabled
entries and navigated back. Ryan authorized the recoverable Delete/Undo test.
The QA pursuit disappeared from Dormant after Delete, returned with its fields
after Undo, and disappeared again after a second Delete. A refresh showed zero
Dormant rows and the active cards at their pre-test totals. The soft-deleted QA
record remains recoverable in Staging audit/history; Production was untouched.
An additional temporary $1,000 Estimate was awarded through the signed-in
Staging UI to existing Job `STG-20260923-001`. The UI moved it out of active
Estimate and >50% totals into Awards, and confirmed that planning value was
not posted as budget. Read-only Staging database checks before and after
showed unchanged Job financials: 177 budget lines, $1,627,664 budget total,
177 revenue lines, and financial baseline version 433. Ryan approved
recoverable removal of this second QA pursuit; it is soft-deleted and the
Awards card returned to its prior 5 pursuits/$34,121.08. The Job was left
untouched. On October 8 Ryan verified that `Ryan@thenorthgategroup.com`,
the ordinary Staging User, cannot see E.O.S. He also found that tracker card
values spill off the screen on his phone. Commit `952dfb8` constrains the
mobile label/value grid, permits long values to wrap, and aligns the filters
to the viewport; Netlify published it on Staging as deploy
`6ac7a0c96371d20008cd6d9c`. Seven focused tests and a compile-only
Staging-identity build passed. Ryan refreshed on his phone and accepted the
improved layout. Additional rollback-only Staging database checks confirmed
that a shared client edit appears in both linked pursuits, and a repeated
existing-Job award returns the same Job without changing budget or baseline.
The test transaction left zero QA clients or pursuits. A 200% browser view,
remaining alternate-role UI checks, and true concurrent-click behavior
remain interactive gaps; award and access rules also passed rollback-only
database tests earlier.

Before any Production deployment:

1. Rehearse the migration on an isolated database against the current schema.
   **Completed October 7** on the temporary restore described above. The
   `tests/eosPursuit.live.sql` fixtures rolled back; exact initial migration
   was followed by local corrections for default grants and trigger access,
   which are consolidated into the repository migration file.
2. Apply only to isolated Staging after rehearsal. **Completed October 8.**
   Only the owner-approved temporary Staging tester is granted. The ordinary
   User remains ungranted; the other named managers are not invented or
   promoted.
3. Run the staging-only workbook import and repeat it. **Completed October
   8.** Existing Job links were checked; all five numbers are unmatched in
   Staging. Resolve ambiguous mappings with the owner later; do not guess.
4. Signed-in browser-check Manager/Director with and without EOS grants,
   technical Developer without business authority, desktop/laptop/mobile/200%
   text, all inline/full editors, sorting/filtering, client sharing, delete/undo,
   dates, metrics, reminders and award retry/concurrency. Check Job creation
   permissions and that no budget is posted. **Partially complete:** signed-in
   Director page, count, search and New Pursuit overlay; backend grant/denial
   checks. Name-only save, full and inline edits, follow-up dates, card totals
   and filter, Dormant transition, reminders, award-overlay cancel, and
   Delete/Undo/redelete and one existing-Job award submission without budget
   posting also passed on October 8. The ordinary User's lack of E.O.S.
   visibility passed owner testing. Ryan accepted the repaired phone layout;
   shared-client propagation and sequential award retry passed rollback-only
   checks. The 200% view, remaining alternate-role UI, and true concurrent
   award clicks remain interactive gaps; full owner acceptance remains open.
5. Promote this feature through its own Staging acceptance and release path.
   Staging is deployed; Production app/database remain unchanged.

Rollback: revert/hide this isolated code before promotion. If the additive
schema has been applied, leave its tables intact until data and audit have
been exported/reviewed; do not drop EOS data as an automatic rollback.
