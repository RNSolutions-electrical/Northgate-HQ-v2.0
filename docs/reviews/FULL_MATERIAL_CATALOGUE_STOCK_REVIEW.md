# Full material catalogue and v5 stock review

**Mode:** Production Mode. **Status:** Production rollout authorized September 21; migration applied, frontend deployment in progress.
**Baseline:** `84440ec` from `origin/main` (September 21, 2026).
**Migration:** `20260921221242_full_material_catalogue_stock_review.sql`.

## User workflow

Inventory → Full Catalogue → Material details edits the existing canonical material.
Add Catalogue Material creates a new item using the same editor. The estimating
Workbench uses the same editor. Existing catalogue edit/Department authorization
continues to control shared catalogue writes.

- Aliases remain in `item_aliases`; removing one archives it and preserves history.
- Each material supports multiple current vendor quotes, with vendor, quoted amount,
  quantity in the catalogue unit, and an optional HTTP(S) product/vendor link.
- The average is the arithmetic mean of normalized per-unit quotes, with one current
  quote per vendor. Explicit zero participates; missing prices are not treated as zero.
  Without quotes, the average/reference price can be entered manually.
- The average updates the estimating master. Existing explicit Inventory prices,
  including zero, keep their v5 precedence. Saved estimates, assemblies and ledger
  prices are not rewritten.
- Labor stores the original user-entered hours, basis quantity, unit, conversion
  factor, and optional NECA edition/source reference. Hours per catalogue unit are
  `hours / basis quantity × labor units per catalogue unit`. Per M means 1,000;
  per C means 100; each/ft/custom quantities are supported. Cross-unit conversion
  requires an explicit factor. No NECA reference-rate dataset is supplied.
- Material notes are separate from estimate-specific notes.
- Checking “in stock”, entering any storage unit/shelf/bay/bin text, or suggesting a
  quantity creates a stock request. Location fields and suggested quantity are all
  optional. Partial location hints do not create physical locations or stock.

Catalogue save and stock-request creation are one transaction with an exact-input
retry key. Stock is a separate v5 destination, so returning/declining stock review
never undoes the catalogue edit. Aliases participate in the material version to
prevent an older full edit from replacing a more recent alias change.

## Review and authority

`can_inventory_manager` and `can_inventory_administrator` are default-denied named
additional permissions in the existing permission template/override editor. This
slice maps them to catalogue-stock review within the user's Department. It does not
claim to reconcile every other v5 Inventory action or grant global Manager rank.
The existing Developer technical assignment also permits this review. No accounts
or templates are granted either new permission by the migration. Ordinary Manager
rank or legacy `can_manage_inventory` alone does not grant the new approval action.

Stock requests appear in Inventory → Stock Reviews and the existing dashboard/bell
inbox. Requesters can see their own outcomes. Authorized submitters **may review
and confirm their own requests in a separate step**, explicitly confirmed by Ryan.

The reviewer selects an existing active bin in the material Department, enters and
confirms the **actual total count in that bin**, and supplies a count-review note.
The suggested quantity is context, not an automatic count. A confirmed zero is
valid; an unknown count is not silently zero. Incomplete physical hierarchies must
be completed through existing Storage setup before approval.

Approval verifies active account, current additional permission, real material and
Department, active hierarchy, immutable submitted version/hash, current material
unit, and the balance quantity/rebuild timestamp observed during review. It takes
the same advisory locks as existing intake/count paths. A stale count must be
reloaded. The count transaction, item/location mapping when needed, audit, and v5
completion are atomic. Quantities remain transaction-derived; the adapter never
writes `inventory_balances` directly. A completed request cannot post twice.

Return/decline retain the request and note. The requester can open the material and
save corrected stock observations as a new request. The queue prioritizes pending
requests, with at most 200 requests returned per load.

## Security and compatibility review

- Canonical new action: `CAT-STOCK-REVIEW`; disabled action and inactive accounts deny.
- Generic v5 submission cannot forge this destination; transaction-local guards
  restrict stock submission and decisions to the constrained catalogue adapters.
- The canonical evaluator retains its OID and existing behavior for other actions.
  Default permission resolution retains its OID and existing defaults, adding two
  false flags. Existing Primary protection and permission-governance guards remain.
- New request records have RLS and no direct client grants. Internal validators,
  triggers and the v5 completion hook remain unavailable to client roles. Public
  write/read adapters are authenticated-only with explicit server authorization.
- Source rates, notes, quote changes, aliases, reviews, and counts retain audit data.
  The server recomputes vendor averages and labor conversions. URLs reject script
  schemes. Existing material units cannot change through the full editor.
- Authorized legacy labor edits clear obsolete source-rate metadata. Vendor-backed
  average prices remain derived even when older catalogue write paths are used.
- Catalogue-only users load the catalogue without requesting inventory ledger data.

## Validation

- 191 unit tests pass, including new quote/labor/optional-quantity validation.
- Isolated PostgreSQL execution via PGlite passes the real v5 working-copy/change-set
  functions, alias RPC, pricing guards, price snapshots, and inventory balance ledger
  trigger against schema/auth fixtures. Main catalogue/review calls run as the
  authenticated role. Tests cover duplicate save/approval, stale material/alias/count,
  scoped denial, self-review confirmation, generic endpoint bypass denial, invalid
  price/unit/link inputs, explicit zero precedence, preserved transaction price,
  returned history, disabled actions, notification routing, audit entries and ACLs.
- Production build passes in an isolated directory using the repository's locked
  dependencies and explicit validation-only configuration. The validation bundle is
  not a deployment artifact. Existing chunk-size/XLSX import warnings remain.
- Local browser form check verifies displayed vendor average, conversion from
  24 hours/M to 0.024 hours/FT, and a location-only request with null quantity.
- Live-schema migration rehearsal, real signed-in multi-user/browser acceptance,
  and independent concurrent database sessions have not been claimed.

Reproduce isolated SQL tests with an installed PGlite package:

```sh
PGLITE_MODULE=/path/to/pglite/dist/index.js node scripts/verify-material-catalogue-review.mjs
```

## Rollout

1. Obtain Ryan's separate production migration/deployment approval under the existing
   v5 rollout policy. Reconcile actual deployed definitions and migration history.
2. Rehearse/apply the new migration, verify function ACLs/RLS/advisors and action
   mapping, then build/deploy the matching frontend using production configuration.
3. Assign the new scoped review permissions to the people Ryan selects through the
   existing audited permission controls. Developer review access already resolves
   from the established technical assignment.
4. Perform signed-in acceptance: catalogue save/search, vendor link/average, labor
   conversion, optional stock hints/quantity, pending inbox, return/decline, self-review,
   confirmed count, stale-count reload, and no duplicate posting.

No production database, user permissions, or deployed site were changed in this session.

## Authorized production rollout — September 21, 2026

Ryan explicitly approved applying the migration and deploying. The full migration
passed a rollback-only rehearsal against the live schema, then was applied as
`20260921224510` to `keogysnoukbendfkfjcn`. The four public workflow RPCs deny
anonymous execution; authenticated access is scoped inside each adapter. Internal
helpers deny client execution, and the retry table has RLS with no client grants.
New security-advisor notices are expected for the private RPC-only table (RLS
without policies) and authenticated guarded SECURITY DEFINER adapters; no new
anonymous endpoint or mutable-search-path finding was introduced.
See [Supabase advisor guidance](https://supabase.com/docs/guides/database/database-linter).
