# Inventory Search and Cart: First Pass

Production scope approved September 6, 2026: simplify the main Inventory search
screen, cart workflow, mobile presentation, and diagnostic clutter. No schema,
RLS, ledger calculation, financial posting, or tool-custody changes.

## Delivered

- Inventory opens to tracked bin stock rather than the full material catalogue.
- Materials group across bins, with total quantities, expandable source rows,
  unit cost, multi-term metadata search, location filters, optional category and
  subcategory filters, and 40-material display pages.
- Zero-stock tracked materials remain searchable. Full Catalogue explicitly
  includes non-stocked materials; they cannot be added without source stock.
- The existing authorized stock view is fetched in stable 1,000-row pages instead
  of silently stopping at 1,000. Cart candidates remain positive-stock only.
- Adding the first item opens/reuses the existing server cart. Quantities are
  checked locally, and server RPC validation remains authoritative.
- My Cart is available in the workspace header. The compact cart supports source
  review, per-line destinations, Apply To All, removal, and a final confirmation.
- Jobs and service calls are optional. Other / Uncoded requires a note and maps
  to the existing `unknown` destination and `remove_stock` ledger semantics.
  Existing historical records are not rewritten. Job/service-call destinations
  continue to require their record IDs; a named job/service-call picker is pending.
- Personal material custody is no longer offered. Existing legacy personal-user
  cart destinations must be explicitly replaced before checkout, not silently
  reclassified. Tool custody remains unchanged.
- Mobile/narrow or coarse-pointer interfaces offer Scan. Desktop search does not
  offer camera controls. Bin scan results open source-filtered material search.
- Transaction-only users resolve bins through the stock view they can already
  read; unit/shelf/bay resolution retains existing management-only hierarchy reads.
- Diagnostic footer cards, technical summary cards, cart internals, and reserved
  controls are hidden unless developer diagnostics is enabled. Errors remain visible.

## Preserved Contracts

Writes still use `open_inventory_cart`, `add_inventory_cart_item`,
`remove_inventory_cart_item`, and `finalize_inventory_cart`. There are no direct
balance writes, new job-cost posting paths, or changes to approval rules.
Vehicle destinations use the existing checkout mechanism. Dedicated van-stock
search/presentation and tool search are not introduced by this bin-stock UI pass.
No personal addresses or material-storage locations are added.

## Validation

- `npm test`: nine passing tests, including stock grouping, zero quantities,
  location filtering, multi-term search, and catalogue separation.
- `node scripts/verify-inventory-pass.mjs`: isolated browser fixture rendering
  the real Inventory components and hooks, with mocked Clerk/Supabase transport.
  Desktop 1440, tablet 768, phone 390: search, quantity validation, auto-open/add,
  removal, uncoded checkout, review/cancel/confirm, vehicle selection, error
  display, readonly controls, scan dispatch, and horizontal overflow pass.
  Also checks retrieval past 1,000 rows. No real inventory was changed by testing.
- Full Vite build passes; existing large-bundle warning remains.
- Live read-only inspection confirms the stock view fields, destination handling,
  checkout permission checks, and management-only location hierarchy RLS.
- Physical camera capture and authenticated production checkout still require
  Ryan's device/account acceptance test.
- Feature commit `5305e73` deployed as `6a9da715ae07620008f843e2`.
  Production Inventory and its JavaScript returned 200, with the correct MIME
  type and search/checkout code present. Netlify secret scan found no matches.

Dropbox held locks on the existing build/cache directories. Validation used fresh
ignored `.temp` build output and per-process fixture caches, leaving those files alone.

## Acceptance Check

1. Refresh Inventory. Find a known stocked material; expand it and check its bins.
2. Search a non-stocked item using Full Catalogue. Confirm no checkout source appears.
3. Add stock from a chosen bin. Open My Cart and verify quantity/source.
4. Set a destination or an uncoded note, apply it, and inspect Review Checkout.
   Cancel unless the withdrawal is a real movement you intend to record.
5. On a phone, scan a known bin label and confirm source-filtered search opens.
6. For a real checkout, verify the transaction and source balance afterward.

## Next Pass / Backlog

- Counts: opening quantities, discrepancy review, valuation completeness.
- Locations and dedicated van-stock browsing; integrate existing vehicle movement
  contracts before representing vans as selectable withdrawal sources.
- Unified material/tool discovery while retaining individual tool custody records.
- Replace job/service-call ID fields with scoped named pickers.
- Decide the job-cost approval/posting workflow later; do not auto-post transactions.
- Personal material custody stays out of scope unless Ryan explicitly revisits it.

Checkpoint: first-pass implementation and fixture validation complete. Next action
is authenticated production acceptance, followed by the agreed locations/counts pass.
