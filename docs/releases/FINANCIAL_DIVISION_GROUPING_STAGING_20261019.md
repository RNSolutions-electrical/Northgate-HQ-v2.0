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
