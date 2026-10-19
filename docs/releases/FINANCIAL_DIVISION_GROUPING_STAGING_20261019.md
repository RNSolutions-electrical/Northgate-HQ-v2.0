# Financial division grouping and Add Line - Staging only

Ryan approved a code-only Staging repair after report reconciliation exposed mixed
catalogue, custom and unlinked Toro financial rows. Existing Staging data already
groups correctly. This release starts at Staging `e3652735` and retains its other
changes. Production deployment, database changes and live financial data writes
are outside this task.

## Behavior

Financial viewing, Add Line contexts and the export division selector now share a
single resolver. Explicit project identity and known master identity take priority;
otherwise a unique normalized division code groups inferred rows. Display text is
not identity. Renames, overrides and row order cannot split one division.

Inferred Add Line works without inventing a project division. Its draft remains in
the chosen section and requires the matching numeric prefix. An existing explicit
project division is reused even if no visible row contains its ID. Ambiguous
inference and retired contexts are blocked with an explanation; explicit ambiguous
targets remain distinct. Unassigned opens the existing chooser. Save revalidates
the context and preserves rejected drafts. Existing audited batch and contributor
proposal paths remain authoritative.

This changes display/action context only. Original row IDs, project/catalogue links,
custom status, protected/O&P categories, permissions, financial formulas, forecast
semantics, CO postings, history and source names are preserved. No helper, balancing
or project-division rows are created by viewing. Current Budget override precedence
and signed actual Remaining Budget are unchanged.

## Actual Production-shaped reproduction

A fresh read-only Production Toro snapshot was captured at
`2026-10-19T18:18:09.177741+00:00`. Its JSON SHA256 is
`654e6a42e348eeafc79494a67fcf8d6effcf7159cc5d1b501c80f5365080cc88`.
The raw snapshot is ignored locally and is neither committed nor bundled. The local
browser runner injects it through a virtual module and blocks all external requests.

Released source `376dbf8` reproduces **17 sections, 124 rows and two Add Line
buttons**, on desktop and phone. Final source gives **13 sections**, with all
**124 original identities exactly once** and every original object unchanged.
Division 03/07/08/16 contain 6/8/13/12 rows respectively. Protected job-only custom
`16.5` remains O&P, unlinked, with its **$34,131** budget/forecast intact; Division16
Original remains **$147,900**. Twelve direct Add Line contexts comprise two explicit
and ten inferred targets; Unassigned has a chooser.

Exact before/after aggregate cents match: original/current `83442538`, manual changes
`0`, actual `33255077`, committed `0`, completion forecast `81875768`. Row membership,
financial amounts and history fingerprints remain invariant. The export selector
also has 13 divisions and preserves its existing monetary calculation fields.

## Verification

- Final bounded aggregate: **376 total, 375 passed, one skipped, zero failures**.
  Collect named `*.test.js`/`*.test.mjs` immediately under `tests/` and `test/`, plus
  recursively under `src/`, then pass those paths to `node --test`. Plain `npm test`
  also discovers an unbounded browser-serving harness.
- Nine resolver/export unit cases cover canonical membership, source preservation,
  order, names/overrides/reset, inferred and explicit targets, ambiguity, retirement,
  archived targets, Unassigned, custom project precedence and whitespace codes.
- `verify-financial-grouping.mjs --baseline` and the final unflagged runner prove the
  actual snapshot result at 1440px and 390px. Local saves/cancel, prefix rejection,
  failed-save retention, null-parent custom creation, explicit target creation,
  chooser, mid-draft retirement, contributor proposal/submit, protected scope,
  export selector, bounded sticky headers/collapse and scroll ownership pass.
  All 124 originals remain unchanged after local test additions. No browser errors
  or external requests occur.
- Existing catalogue UI: three groups; Remaining Budget: 40; Add Line: seven;
  financial workflows desktop/tablet/phone; Edit/sticky: five; estimate review-scroll:
  desktop/phone/resizing all pass.
- Local PostgreSQL: **ten groups pass**. Existing migration/RPC source is rehearsed
  with the prior synthetic 354-line/24-division fixture and synthetic permission
  helpers. The added group proves existing audited null-parent catalogue/custom
  creates, no project/helper insertion, transactional rollback and unauthorized
  rejection. No migration or test save is sent to a live database.
- Synthetic Staging-identity build, `git diff --check`, desktop/phone visual QA and
  fixture exclusion from deploy output pass. Existing bundle-size and browser
  externalization build notices remain.

Ignored evidence: `.temp/financial-grouping-qa/{before,after}.json`, before/after
desktop/phone screenshots, sticky screenshots, `.temp/grouping-*.txt` and local
database evidence. The actual snapshot is required to rerun this private-data
browser reproduction. The software-engineering skill is absent from available
catalogues and local/repository skill locations; repository instructions apply.

## Live Staging and publication

Before deployment, existing Toro Test has **12 sections and 12 Add Line buttons**.
Its current/actual/remaining totals are **$1,007,500.06 / $339,057.18 / $668,442.88**;
forecast/forecasted remaining are **$818,757.68 / $188,742.38**. Masonry actual
Remaining Budget is **-$1,229.59**. These preexisting Staging records are not replaced
with the Production snapshot. Final deployment and read-only comparison receipts
will be recorded below.

Local save/authorization tests use in-memory fixtures and synthetic local PostgreSQL
permissions. Live verification uses the existing signed-in desktop Developer
session and cancelled workflows; no live Add Line/name/reset/proposal save is made.
Production site/main and both environments' seven financial table fingerprints
are checked for invariance around this Staging-only deployment.

### Verified publication

- Exact code commit: **`5f7ce88916e7d4948440e335182f3179577b465e`**.
- Dedicated Staging site: `431ce717-1a06-45a0-9d7a-8acd06a67dde`.
- Ready deploy: **`6ad665bfdba3040672cb1502`**, branch `staging`, published
  **2026-10-19 18:47:50.667 UTC**, exact commit confirmed, no deploy error.
- Review: https://staging.rnsolutions.net/jobs . Immutable receipt:
  https://6ad665bfdba3040672cb1502--northgate-hq-staging.netlify.app/jobs .
- Secret scan: 1,068 files; zero regular/enhanced matches. Strict-TLS custom and
  immutable Jobs pages/assets return 200 with correct MIME and identical hashes.
  JavaScript `/assets/index-DOyxZiOy.js`, 2,110,849 bytes, SHA256
  `a583216fcbf04ee625702fadf412695a945264e03057ab4fb74f05dc5daa5dec`;
  CSS `/assets/index-CFpMAqNI.css`, 186,097 bytes, SHA256
  `1b369a81dae546c60fb830877afca916c1f5eb5d45bafea001911061bbe3cae3`.
  Staging identity/new controls are present; Production endpoint, synthetic keys
  and private fixture markers are absent.

Signed-in live Developer comparison proves all **12 preexisting Toro Test headers
and all eight summary cards are identical** to the pre-deploy baseline. The export
selector retains all **180 authorized rows** across those same 12 divisions.
Electrical Add Line opens exactly one draft in the electrical section; Cancel
removes it. The existing project-name editor opens with the correct catalogue name;
Cancel/Done return to normal viewing without name buttons or drafts. Masonry still
shows **-$1,229.59** actual Remaining Budget. Expanded Masonry pins at the measured
**96.84375px** Staging shell/banner boundary; column labels begin at its
**192.3125px** bottom. No captured browser error remains. The Staging review tab is
left open. No live save/reset/import/archive/proposal action was performed.

After the cancelled live smoke, all seven complete Staging table fingerprints
match their before values. Production's divisions, COs, postings, allocations,
revenue and Pay App fingerprints also match. Its complete budget-line fingerprint
changed during the window: read-only inspection finds contemporaneous updates on
other jobs, while **all 124 active Toro original rows still match the captured
snapshot field for field**, with no additions/removals. A claim that the entire
Production budget-line table is unchanged would therefore be incorrect; attribution
of other-job activity is outside this task. This task performed no Production
write. Ignored `live-invariance.json` records the exact before/after fingerprints.

Production `main` remains **`27cb1ccbdde4a3a80c7805c2de6be59804afbab1`** and its ready
deploy remains **`6ad6498a10b13ea805229665`**. No Production promotion or schema/auth
change was performed. The receipt-only follow-up skips CI and retains the verified
Staging deploy. No release blocker remains; live saves and live non-Developer
authorization were deliberately verified only through local fixtures/rehearsal.
