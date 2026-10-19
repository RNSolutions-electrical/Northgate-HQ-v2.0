# Job Edit menu and expanded division context — Staging only

Ryan approved the focused Jobs-page edit-menu change on 2026-10-19, then added
expanded financial division headers that remain visible while scrolling their
rows. Production remains unapproved. Based on Staging receipt `a8e35b46`; all prior
Remaining Budget, catalogue/naming, financial Add Line, CO and review-scroll work
is retained. No database migration, data correction or permission change is needed.

## Review behavior

On a job, Edit opens a compact menu. Job Details keeps its existing form/destination.
Division Names opens Financials in a focused mode with the existing per-job name
edit and catalogue reset flow. Done returns to normal viewing, where division-name
edit buttons are hidden. Menu entries use each operation's existing permission
predicate: a contributor with financial access can reach naming proposals without
acquiring Job Details/management authority. Service calls do not gain a financial
division editor. Backend save/proposal authorization is unchanged.

The menu supports keyboard opening, arrows/Home/End, Escape with trigger focus,
Tab/focus departure, outside click and mobile layout. Active inline drafts block
new Edit destinations; Done is disabled while an editor/save is open. Name dialogs
retain rejected drafts, trap focus, restore the opener, guard dirty Escape and keep
the existing explicit save/cancel behavior. Portal rendering keeps those dialogs
above sticky header layers. Job/tab navigation resets the naming mode.

Expanded financial division headers use section-bounded CSS sticky positioning;
collapsed headers stay in normal flow. Desktop column labels stay below the sticky
division header; mobile rows retain their field labels. Resize observation measures
actual shell/banner and division-header heights, including responsive wrapping.
Only expanded financial sections change the local overflow behavior needed for
sticky positioning; the document remains the vertical scroll owner. No fixed cloned
header, nested vertical scroller or global module redesign is introduced.

The broader consistency idea is captured in `docs/ROADMAP.md` for later module
reviews, while spreadsheet-style financial inline editing remains intact.

## Verification and receipts

Final explicit aggregate: **367 total, 366 passed, one skipped, zero failures**.
The final synthetic Staging-identity build and `git diff --check` pass.

`verify-job-edit-controls.mjs` passes **five broad browser groups**: desktop and
phone menu keyboard/focus/outside/Tab/Escape, focused mode entry/Done/navigation,
dirty naming Escape and inline financial draft retention, original Job Details
destination and unchanged amounts; desktop/phone multiple expanded division
headers, actual navigation/banner offsets, sticky column/field labels, section
boundary release, collapse while scrolled and absence of nested or horizontal page
scroll; and permission-filtered Details-only, Names-only or no Edit menu.

Existing catalogue integration passes three desktop/phone/contributor groups
through the new menu. All 40 Remaining Budget/label groups, seven Add Line groups,
existing financial override/protected-reason/contributor workflows, and preserved
estimate review scroll checks pass. A regression caught fractional-pixel mobile
save feedback clipping; measured shell/viewport scroll margins now keep that
existing feedback fully visible. Assertions were retained. Desktop/phone sticky
screenshots were visually inspected. Evidence is ignored under `.temp/job-edit-qa/`
and the related test logs. No browser exception remains.

Business-data mutations are confined to in-memory fixtures. Signed-in live smoke
used the existing Developer session without saving business data.

The optional software-engineering skill was searched in both available skill
catalogues and local/repository skill locations; it is not installed. Repository
working, testing and release instructions govern this bounded implementation.

## Verified Staging publication

- Source commit: `1870886b16262763ec43176745d52ee2d67b0ee0`
  (`Group job Edit actions and pin expanded financial divisions`).
- Branch: `staging`; dedicated Staging site:
  `431ce717-1a06-45a0-9d7a-8acd06a67dde`.
- Ready Netlify deploy: `6ad641f93f46c4a763bedc2c`, published
  **2026-10-19 16:15:17.015 UTC**, exact source commit/branch confirmed,
  no deploy error; 1,060 files scanned and no standard/enhanced secret matches.
- Review: https://staging.rnsolutions.net/jobs
- Immutable: https://6ad641f93f46c4a763bedc2c--northgate-hq-staging.netlify.app/jobs

Strict-TLS custom-domain and immutable `/jobs` requests returned 200 and identical
assets, with the new controls and isolated Staging identity; synthetic build keys
are absent. JavaScript `index-DFosCT1h.js` SHA256:
`90f3f4d9f6a72aaf58334e6925861b6819a5cdcbe954ba5863c55ae649308928`.
CSS `index-CFpMAqNI.css` SHA256:
`1b369a81dae546c60fb830877afca916c1f5eb5d45bafea001911061bbe3cae3`.
Netlify's primary-site deploy context is named `production` even for this dedicated
Staging site; this receipt does not describe a Northgate Production deployment.

After reloading the ready deployment, authenticated live Toro Test smoke confirmed
Edit > Job Details / Division Names, focused-mode entry, the existing Masonry name
and catalogue-reset dialog, disabled conflicting controls while it was open,
Cancel > Done and hidden division edit buttons in normal viewing. No name/reset
save, proposal, inline financial save or other business action was submitted.

Live Concrete and Masonry sections were expanded and scrolled. Concrete pinned
below the actual 96.84375px shell/banner offset, then released completely before
Masonry took over at that same offset. Masonry's column labels began at its header
bottom, 192.3125px, with no overlapping previous header. Its signed Remaining
Budget remains **-$1,229.59** ($5,500 budget less $6,729.59 actual). Existing current
forecasts and Ryan's intervening Staging edits were preserved.

Review by opening a job, selecting **Edit > Division Names**, using the existing
name/reset flow and **Done**, then expanding financial divisions and scrolling.
Live smoke covered the signed-in Developer desktop session; phone, other permission
combinations, dirty/failed saves and destructive workflow protections were verified
with fixtures, not additional live records. Business acceptance remains Ryan's
review. No known implementation blocker remains.

Production `main` remains `1e0c5635b6289b4e2f4c55eaa8fb81b9cb8152a0` and its published
deploy remains `6ad28722f48eddc8eb974f91`. This change adds no database/schema/auth
operations and makes no live financial data edits. The publication receipt is
committed separately with `[skip ci]`; retain all existing Staging candidates and
do not promote this branch without separate approval.
