# Shared calculator — Staging candidate

Ryan authorized a shared-shell calculator and Staging deployment alongside his accepted notes feature. Production promotion is not authorized. Baseline is current Staging `d1fad0ccff7daa3bd7e91c3f58ea6add327eddfd`; only calculator/shell/test/documentation changes are included. The active Dropbox checkout is untouched. No database changes, business-estimate writes, new routes or permission changes are needed.

## Behavior

Calculator is below the last permitted rail navigation item (Developer when authorized) and before the Northgate HQ footer. It is independent of Developer permission, available to authenticated users, and appears in the App Menu below 900px. The parent-shell panel persists outside the route-reset content. It has no backdrop, focus trap or background scroll lock. Desktop users can drag the header, use directional buttons in Position / help, or reset the position. Resize/history expansion clamps it to screen bounds. Mobile docks above the existing bottom navigation and uses scrolling within the panel for limited height. Minimize keeps a small restore button; Close hides it without clearing expression/history.

Expression typing is native input; Enter calculates and records history only from that focused input. Escape minimizes only when focus is inside the calculator. Tab can leave normally. Calculator launch focuses the input; close/minimize restores a visible launcher/menu control when appropriate. Parent dialogs and same-origin iframe dialogs suspend the calculator; their dismissal does not pull focus away from the module. There are no document-level calculator keyboard handlers and no automatic insertion into estimate fields.

Expression, up to 20 deduplicated history entries, open/minimized state, history visibility and position are stored in browser sessionStorage under a user/environment-scoped key. State survives route changes and reload. User changes mount a fresh scope; logout/unmount removes the old scope. Storage failures fall back to memory; parsed storage is bounded and history results/percentage details are revalidated. No calculation values are sent to a backend. Clipboard writes occur only on explicit Copy actions. Already copied system clipboard content is intentionally not erased on logout.

## Arithmetic contract

The bounded tokenizer/parser accepts decimal numbers, unary signs, parentheses, + − × ÷ and one postfix % per value. Normal multiplication/division precedence and left-to-right additive chaining apply. No eval, Function constructor, identifier lookup, functions or implicit multiplication. Invalid input, repeated percent signs, division by zero, excessive nesting/work and excessive number size are rejected.

| Expression | Main result | Secondary percentage amount |
| --- | --- | --- |
| `200 + 20%` | `240` | `20% of 200 = 40` |
| `200 − 20%` | `160` | `20% of 200 = 40` |
| `200 × 20%` | `40` | `20% of 200 = 40` |
| `200 ÷ 20%` | `1000` | `20% of 200 = 40` (division uses the fraction 0.2) |
| `200 + 10% + 20%` | `264` | `20% of 220 = 44` |
| `200 + (10 + 10)%` | `240` | `20% of 200 = 40` |
| `20% × 200` | `40` | `20% of 200 = 40` |
| `20% ÷ 200` | `0.001` | None: no percentage amount is applied to a base in the final operation |
| `200 + 10% × 2` | `200.2` | None: precedence makes the right operand a fractional product, not a direct percentage |
| `(200 + 20%) × 2` | `480` | None: final operation is multiplication by 2 |
| `20%` | `0.2` | None: no base amount |

A direct right percentage operand in +/− applies to the current left value; all other percentage evaluations are fractions. Parentheses around that operand preserve its semantics. Secondary data is derived only from the current valid final operation; editing to an incomplete or unrelated expression clears it immediately. Decimal arithmetic uses exact rational BigInts internally, memoized within each bounded expression. Main/secondary/history/copied output use the same 12-decimal-place, half-away-from-zero rounding with trailing zeros trimmed. `0.1 + 0.2 = 0.3`. There are no ledger or pricing writes.

## Verification

- 308/308 named Node regression cases passed, including notes, labor rates, pricing and export isolation.
- Six calculator regression groups cover arithmetic/rounding, chained/parenthesized/signed percentages, invalid code/zero division/limits, bounded canonical history, environment/user scope and coordinate clamps.
- `scripts/verify-calculator.mjs` passed against the actual shared shell plus actual estimator iframe, using synthetic identities and only local callbacks; external requests are blocked. Checks include both screens, history/copy, drag/keyboard/reset/resize, background input, route changes/reload, parent/iframe modal precedence, focus/Tab/Escape, non-Developer access, user switching/logout, mobile menu and screen bounds.
- Accepted notes UI save/reload/review checks passed again with unchanged notes code.
- The exact Staging-configured Vite build passed using verified public configuration from the currently published Staging bundle. Existing chunk/dynamic-import warnings remain.

Local evidence is under `.temp/calculator/` (regression/build logs, JSON UI results, desktop/mobile screenshots), with accepted notes evidence under `.temp/estimate-notes/`. Deployment identity/assets/configuration and supported live QA will be recorded separately after publication. Previous signed-in browser tooling failed to initialize and fresh Clerk sign-in hit Cloudflare; do not bypass access challenges or mutate business estimates to claim live smoke coverage.
