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

Browser mutations are confined to in-memory fixtures. Live smoke will inspect
the existing Developer session without saving business data. Exact source/deploy
and live smoke receipts follow after publication.

The optional software-engineering skill was searched in both available skill
catalogues and local/repository skill locations; it is not installed. Repository
working, testing and release instructions govern this bounded implementation.
