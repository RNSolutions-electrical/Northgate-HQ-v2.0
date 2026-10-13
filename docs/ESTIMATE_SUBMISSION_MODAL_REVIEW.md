# Estimate submission modal — local review candidate

2026-10-13. Production Mode; implementation and validation only. No push,
deployment, shared database changes or actual estimate submissions.

## Baseline and isolation

Isolated clone: `C:/Users/Ryan/Documents/Codex/2026-10-13/task-2/northgate-review-modal`.
Branch: `fix/estimate-review-modal`, based on `b71a8f1c03862c28801a8e7d1e204678d5505d68`.
Read-only remote verification: main `b71a8f1`, staging `3bbef138`, annotated
v0.7.2 tag `47573b3` peels to deployed code `b452934`.
The active Dropbox checkout and previous notes checkout were not repaired or edited.
Read AGENTS, Codex Discipline Protocol and environment release workflow. No
`.agents/skills` directory was available in these checkouts. Existing notes,
calculator, labor rates and reviewer decision controls are preserved.

## Change

The personal-estimate submission reason form is now a native parent-document
dialog opened by the existing Submit for Review button. Opening only opens
the dialog. Confirm submission invokes the existing `submit_v5_estimate_for_review`
RPC with the same reason, working-copy ID, saved version and request ID fields.
Whitespace, dirty-estimate, access and submitted-status restrictions remain.
Cancel/Escape retain the reason for the same open estimate; changing estimates
clears it. Errors retain text. Success closes the modal, clears the reason,
announces success and locks the submitted payload. Reviewer inputs are unchanged.

The dialog names/describes itself, focuses the reason, wraps keyboard focus,
returns focus on cancel, focuses the success status after submission, and
restores body scrolling on route change/unmount. During submission its controls
and dismissal are disabled. A synchronous request guard prevents rapid duplicate
submits; responses use the captured record/revision and cannot replace a newly
selected estimate.

Only selected estimate editor frames fit the available viewport. Frame size
accounts for the measured header/banner, mobile bottom navigation and outer
messages; the editor keeps its own scrolling. Scoped shell/rail height rules
remove the redundant outer scrollbar, including a wrapping Staging banner.
Assembly library and review-decision pages retain their prior frame sizing.

## Evidence

- All 305 explicit `tests/*.test.js` and `tests/*.test.mjs` tests pass.
- Vite build passes using synthetic isolated development settings; output is
  validation-only and must not be deployed. Existing chunk-size/xlsx warnings remain.
- `scripts/verify-estimate-submission.mjs`: actual AppShell, WorkbenchRoute,
  handler and iframe editor; only auth/database adapters are mocked. Every
  external browser request is blocked. Desktop 1440x900 and mobile 390x600,
  Production-style and Staging-banner shells pass. Coverage includes opening
  without RPC, repeated clicks, whitespace/dirty validation, saved revision,
  Tab focus wrap, Escape/Cancel/focus return, retained failure text, pending
  dismissal and duplicate protection, success lock, denied permission,
  route change and pending unmount cleanup, root scrollbar checks and calculator
  modal precedence/state retention. No browser page errors.
- Existing `verify-estimate-notes.mjs`, `verify-calculator.mjs` and
  `verify-labor-rates-ui.mjs` local browser checks pass.
- Screenshots and machine-readable results are under `.temp/estimate-submission/`;
  notes, calculator and rates evidence remains in their existing `.temp` folders.

The general `npm test` command discovers a long-running fixture server in this
repository and was stopped. Explicit automated test files passed instead.
An initial unconfigured build was correctly rejected by the environment guard.

## Screenshot limitation

Requested Library ID `libfile_2445c9a1c0dc8191a011aaba40cafbcd` resolved to
`image(8).png`, image/png, 212955 bytes. Current Library skill's documented
resolved-reference transfer helper was materialized locally, and preparation
used an explicit destination in this Windows workspace. The first sandboxed
transfer failed; the approved helper retry downloaded but failed before atomic
installation because Windows Python has no `os.setxattr` (`AttributeError`).
No readable final screenshot file exists, so the user's original pixels could
not be inspected. No bypass or invented URL was used. Implementation was based
on independent code inspection; generated fixture screenshots were inspected.

## Staging recommendation

No schema migration is necessary. After approval, integrate this exact local
candidate into the current staging branch, preserving intervening work; rerun
the explicit tests and build with the existing staging-only configuration.
Publish only to the independent Staging site. Use a labeled test estimate for
ordinary-user and reviewer acceptance: modal confirmation, save-first/error
recovery, status lock, notes, calculator and viewport scrolling. Record the
tested commit and Ryan's acceptance before any Production promotion.

Unrun: authenticated Staging/Production smoke tests, live RPC/database tests,
real-estimate submission, deployment and owner acceptance. These are outside
the currently authorized local-only scope. The original screenshot inspection
remains blocked by the Library helper's Windows extended-attribute support.
