# Inventory Checkout Notes

September 6, 2026 refinement to the Inventory search/cart pass.

## Rule

For every destination, checkout requires a nonblank cart note OR a nonblank note
on every line. Both can be supplied. A cart note covers otherwise unnoted lines.
Spaces, tabs, and line breaks alone do not count as notes.

Cart notes are separate from Apply To All. Applying/changing destinations does
not erase line notes. Both the cart note and individual line notes appear in the
checkout review. The server independently enforces note coverage.

## Storage and History

- User cart note: `inventory_transactions.notes` (null when not supplied).
- Individual line note: `transaction_items.note` and finalized
  `inventory_cart_items.note` (null when not supplied).
- Cart notes are not copied into empty line notes. Line notes do not replace the
  cart note. Both retain their separate provenance in the transaction audit trail.
- `read_inventory_transaction_history` retains its existing return shape and
  authorization; its note field now includes separate Line and Cart labels when
  both exist. The Inventory history table displays that field.
- Migration `20260906180642_inventory_checkout_note_coverage` is applied. It
  preserves checkout permissions, stock locks, ledger calculations, and grants.
  The legacy four-argument function delegates to the guarded five-argument path.
  Existing overload/default-argument ambiguity for direct four-argument SQL calls
  remains a pre-existing limitation; the app explicitly sends all five arguments.
- No historical data, RLS policies, job-cost posting rules, or approval rules changed.

## Verification

- Fifteen Node tests pass, including coverage combinations across all six offered
  destinations.
- Actual Inventory component/hook browser fixtures pass on desktop, tablet, and
  phone, including line-only eligibility, both-note payloads, Apply To All note
  preservation, review/cancel, and checkout.
- `tests/inventoryCheckoutNotes.sql` passes inside BEGIN/ROLLBACK against the
  migrated database: missing coverage rejected for each destination; cart-only,
  line-only, both, and partially noted carts preserve stored notes and history.
  No synthetic users, carts, transactions, or balance changes were retained.
- Full production build and diff whitespace validation pass.
- Security advisors show no new findings; two existing legacy-wrapper warnings
  disappeared after delegation switched that wrapper to SECURITY INVOKER.

## Manual Check

Feature commit `7e09d29` is deployed as `6a9dac043776b5000734992b`.

1. Add two materials and give each a different line note. Review is available
   without a cart note.
2. Enter a cart note and apply a destination to all. Both line notes remain.
3. Clear one line note. Checkout remains available while the cart note is present.
4. Clear the cart note too. Checkout is blocked until note coverage is restored.
5. For a real withdrawal, confirm checkout and verify Line/Cart notes in history.
