# Exploration intake: Change Orders, material price monitoring, ARC ED

Recorded: 2026-09-28 16:00 EDT (UTC-04:00), machine `Ryan_Northgate`.
Mode: **Exploration**. Documentation only; no feature implementation, migration,
external checks/schedules, account changes, purchases or deployment authorized
by this intake. Embedded “build now” instructions are archived proposals, not
the owner's current request. Return to implementation only after scope approval.

## Source register — preserve ideas without duplicating work

1. [Change Order usability/state-model prompt](sources/CHANGE_ORDER_REVAMP_PROMPT_20260928.md):
   repeated September 25 direction, not a new CO engine request.
2. [Material price monitoring and ARC ED prompt](sources/PRICE_MONITORING_ARC_ED_PROMPT_20260928.md):
   new roadmap initiatives in the repository searched this session. Existing
   catalogue and AFC features are foundations, not these completed initiatives.

Both complete prompts are retained here; no Windows attachment is needed by the
next machine. The shared queue remains [ROADMAP](../ROADMAP.md). This intake is
a detailed supplement, not a replacement for the existing backlog.

## Environment / completed-work checkpoint

| Environment | Application checkpoint | Meaning |
| --- | --- | --- |
| Production | v0.5.2, `86933c87717d630561e2ff95c624723583af44e2`; Netlify `6ababcbc35bdf800087a45e8` | Inventory navigation + matching breadcrumb styling, published September 28; latest pre-intake main docs commit `992e3432a69f334b12fcde335c66bda81e9651ad` |
| Staging | `d2e4f61153e6cfe871678a2f8c003266e4284458`; Netlify `6ab6a4cea66ec50008a4acdd`; pre-intake branch `1ae6a949602710798205ef1e203f91a229dd1537` | Contract adjustment state model + Billing revision continuity; not approved for Production promotion |

Production evidence was verified earlier today; Staging deployment/test evidence
comes from HANDOFF 316–319 and its review, not a new live test in this documentation
pass. Remote main/staging refs were refreshed. Historical “Production unchanged”
statements refer to those earlier Staging releases, not today's Production version.

### Change Order requirements reconciled

**IMPLEMENTED ON STAGING; acceptance/integration gates remain:** compact status
model, incomplete drafts preserving blank versus zero, shared decision note,
Supervisor preparation versus Manager commitment, approval without signed PDF,
separate documentation/closeout requirement, signed/zero/mixed-value lines,
separate CO/CR numbering in the same adjustment engine, cost-code Changes posting
without changing Original Budget, and filtered adjustment-log reporting.
See [state-model implementation and evidence](../reviews/CONTRACT_ADJUSTMENT_STATE_MODEL_20260925.md).

**Owner decision already locked:** revisions of a partially billed CO continue
as one billable family. Latest approved value carries all prior billed amounts;
historical Billed Pay Apps remain immutable. Do not reopen this as an unanswered
question or count original and revised values twice.

**NOT COMPLETE / HOLD:** actual overlapping-session concurrency proof;
correction/reversal/Developer deletion regression; actual Storage round trip;
complete estimate/Silas handoff checks; owner Billing acceptance. Posted-record
archival remains withheld until Billing preserves its contract value. Broader
dashboard/usability work is not completed merely because the CO card is shorter.
Do not claim all original prompt requirements are done or Production-ready.

## Initiative MP — Automated material price monitoring / review

Status: **PLANNED**, not implemented by this intake. No vendor contacted.

### Existing architecture and reuse

- Inventory Full Catalogue and the estimator share canonical materials and
  `CatalogueMaterialForm.jsx` / `catalogueService.js`.
- Existing multiple vendor quotes include vendor, amount, quantity and optional
  URL. Quotes normalize to catalogue units; their average informs the estimating
  master. An explicit Inventory override takes precedence, including zero.
- `InventoryPriceWorkspace.jsx` already displays master/override/effective price,
  uses existing set/clear RPCs and reads `item_price_history`. Existing v5 review
  infrastructure and stock review are reusable patterns, not interchangeable
  approval destinations. Price review must not create stock or counts.
- Reference: `docs/reviews/FULL_MATERIAL_CATALOGUE_STOCK_REVIEW.md`,
  `tests/v5InventoryPriceWorkflow.test.js`, `src/lib/materialCatalogueDetails.mjs`.

### Proposed workflow and interface

Source URL -> provider lookup -> normalized observed price -> difference -> human
review -> approve/reject/defer -> authorized canonical update + audit.
Place consolidated **Price Review under Inventory**, linked from Full Catalogue;
reuse existing table/filter/review conventions, not a second catalogue app.
Show material/category, existing and detected unit prices, dollar/% difference,
vendor/source link, last-check time and review status. Support bounded batch review
with per-item validation and outcomes. Never update simply because a price differs.

Keep lookup results (no change/increase/decrease/unverifiable) distinct from review
decisions (needs review/approved/rejected/deferred), even if rendered together.
Missing/failed lookup is not zero. Zero baseline makes percentage difference N/A;
dollar difference can still be shown. Check currency, pack quantity, UOM, tax,
shipping, location/account-specific prices and stale catalogue versions before
calling prices comparable. Preserve old price on failure; stale approvals must
not overwrite later edits. Decide how approved quotes affect the existing average
and overrides rather than silently changing price precedence or saved estimates.

### Phases (proposed, independently accepted)

1. Architecture + consolidated review UI + source/status model + manual workflow.
2. Selected vendor adapters and manual checks.
3. Developer-configured scheduling: weekly, monthly, quarterly, semiannual,
   annual, manual only; manual run available; operational disable switch.
4. More providers, analytics, richer detection/rejection/source-failure history.

### Candidate persistence / security — design only

Inspect deployed schema before deciding names or migrations. Likely additive
source/adapter configuration, immutable observations/check runs, review decisions
and schedule configuration. Reuse canonical items, vendor quotes, price history,
audit and review actions rather than duplicating them. Persist old/observed/unit
normalized price, source/time, actor/decision and applied time, including rejection
and failed checks. Apply authorized price update + audit atomically and idempotently.

Developer schedule authority is not automatically price-approval/business authority.
Define authorized review roles/departments and batch/self-approval rules; enforce
through existing server action checks/RLS. No new broad role defaults now.

Provider API/licensed feed is preferred where available; provider-by-provider
feasibility, terms, rate limits, account access and cost need verification. Never
promise a universal scraper. Run lookups server-side, not via browser CORS bypass.
Allowlist providers, restrict HTTP(S), reject private/loopback/link-local targets,
revalidate redirects/DNS, cap time/body size and concurrency, retry with backoff,
and treat vendor text as untrusted data. Keep credentials server-side and isolate
Staging from Production. No arbitrary-URL worker or paid scheduler is authorized.

### Decisions / acceptance before implementation

- First vendors and representative material URLs; API/licensing feasibility.
- Which price gets proposed: individual vendor quote, estimating master, or
  explicit Inventory override; normalization and average rules.
- Review authority, self-review/batch behavior, comparison tolerance, defer rules.
- Initial frequency, timezone, budget, retention and failure notification policy.
- Tests: missing/zero/pack mismatch, price increase/decrease, no-change, invalid
  source, rejected/deferred decision, stale/concurrent approval, retries, scope
  denial, audit completeness, unchanged historical estimates and inventory.

## Initiative ARC — ARC ED training platform

Status: **PLANNED platform**, future modules below are **CONCEPT**, not existing UI.
Working name: ARC ED — Absorb, Resolve, Create, Educate. Preserve alternatives
VOLT, WIRE, GRID, CORE and “Bolted Fault” as a possible challenge/module name.
No naming exercise now. Teach why, not memorized rules of thumb.

### Reuse / placement / initial architecture

Existing `src/modules/afc/{AfcWorkspace.jsx,model.mjs,engine.mjs,layers.mjs}` is a
calculation/workflow tool, not an education platform. Reuse tested calculations
only after their assumptions fit a lesson; do not alter the operational AFC tool
or claim AFC calculation alone predicts arc-flash energy or protective behavior.
Use existing workspace/cards, routes and permission-aware navigation. Proposed
initial entry: **ARC ED under Add-On Tools**, with a dedicated training workspace;
owner may prefer Employees/Training later. No route/name has been added yet.

Phase 1 can begin with versioned lesson/module content and shared lesson components;
do not create an LMS schema just for static learning. Reuse employee identities.
If persistence is needed, first define versioned course/module records and scoped
progress/attempt evidence rather than recording unverifiable “competency.” No
Supervisor signoff or training-complete flag should imply professional qualification.

### Phases

1. Navigation, extensible foundation, useful **Absorb learning library**, initial
   Available Fault Current lesson (not a Coming Soon page).
2. Interactive visualizations and experimentation.
3. Troubleshooting/random scenarios.
4. Create/design exercises.
5. Educate/teach-back, assessments, assigned training and employee progress.

### Initial AFC lesson scope to preserve and technically review

Explain breaker ampere/trip rating versus available fault current, interrupting
rating and equipment SCCR; bolted/arcing faults versus arc flash; transformer and
conductor impedance (ohms), clearing time, and location-specific AFC. Illustrate
source -> transformer -> service -> panels/feeders -> branch/load. Use clearly
labeled simplified examples, diagrams and assumptions, not unsourced Code claims.
Distinguish trip initiation from safe interruption; an underrated device is not
made safe by saying it merely passes a fault upstream. Source impedance, system
configuration and contributions must bound examples; lower AFC does not alone
establish lower arc-flash hazard. Qualified technical review, applicable NEC
edition/jurisdiction, references/licensing and training safety limits precede
publishing instructional content. This intake does not validate a course or give
instructions for energized work.

### Future module register (not Phase 1)

- **Fault Lab:** transformer/main/panel/~six branches; hidden randomized faults,
  breaker interaction, slow replay of clearing; variable kVA, impedance, voltage,
  conductor size/material/length/parallel sets, rating and fault location. Include
  no-fault, bolted, ground, arcing, motor, damaged/open conductors, high-resistance,
  neutral and intermittent cases; validate simulation limits before grading.
- **Grounding & Bonding Builder:** randomized services/electrodes, conductor and
  jumper sizing, bond locations, progressive difficulty and per-decision scoring;
  parallel equivalent circular-mil area and advanced separately derived systems.
- **Conduit Fill:** actual raceway/conductor types, sizes, quantities, mixed sizes;
  visual fill and why “nine wires” without conductor details is insufficient.
- **Box Fill:** conductors, grounds, devices, clamps, sizes, splices/equipment;
  distinguish visual workmanship from Code compliance and explain limitations.
- **Service Call Simulator:** complaint, hidden randomized wiring, measurement/
  diagnosis, then reveal behind-sheetrock routing and compare trainee reasoning.
- Further candidates: voltage drop, transformers, three-phase visualization,
  phase rotation, trip curves/selective coordination, GFCI/AFCI, arc flash,
  meter use, motor inrush/back EMF/troubleshooting, load/service calculations,
  ampacity/derating, transformer sizing, generator/ATS and panel balancing.
- Long term: assignments/history, difficulty/scores, supervisor review, competency
  tracking, recommendations and teach-back. Explain what changed and WHY.

### Decisions / acceptance before implementation

Choose audience/access and content editors/reviewers, navigation placement,
applicable standards/reference licensing, qualified reviewer, initial lesson
length and whether Phase 1 needs progress persistence. Define later simulator
fidelity and grading independently. Test accessibility, mobile diagrams, scoped
access, worked-example units/results, citations, content versions and separation
from operational AFC documents. No complicated LMS or AI service is presumed.

## Safe next sequence when owner authorizes implementation

1. Recheck Staging CO open gates; do not rebuild that feature from the repeat prompt.
2. Select a discrete next slice: MP manual review foundation or ARC ED Absorb
   prototype/content plan. They can proceed independently after necessary decisions.
3. Inspect exact current routes/actions/schema for that slice, propose the smallest
   additive change and acceptance tests; prototype in Exploration as requested.
4. Implement only approved scope on isolated Development/Staging; preserve history,
   existing price precedence, financial controls and manual workflows.
5. Owner acceptance and separate tagged Production release after safety review.

The existing dashboard, My Work, permissions, forecasts, financial imports,
documents, backup policy and billing-template backlog remains open in ROADMAP.
This intake does not silently reprioritize or close those items.
