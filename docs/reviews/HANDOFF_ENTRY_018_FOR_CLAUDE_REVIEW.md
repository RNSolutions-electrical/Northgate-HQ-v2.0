# Claude Review Packet — HANDOFF Entry 018

## Entry 018

**Date:** 2026-06-10  
**Updated by:** ChatGPT / Codex-style implementation session  
**Phase:** Phase 1 Inventory — Cart open, add-to-cart, and normal checkout verified  
**Session type:** Implementation checkpoint + Claude architecture review request

### Context
Ryan confirmed the updated `HANDOFF.md` through Entry 017 was in the repository before implementation resumed. Work proceeded from the Entry 016/017 sequence: harden cart-open first, then controlled add-to-cart, then normal cart checkout/finalization. Express checkout / manager override remained intentionally out of scope.

### What Was Completed This Session
1. **Cart-open corrections required by Entry 016 were implemented and verified.**
   - Added `vehicles.holds_stock BOOLEAN NOT NULL DEFAULT FALSE`.
   - Replaced `open_inventory_cart` so the active vehicle snapshot is not client-supplied.
   - The RPC uses `auth.jwt() ->> 'sub'` as the authoritative user ID.
   - The RPC checks `can_inventory_transactions` server-side using `default_permissions_for_role(role) || permission_overrides`.
   - NULL vehicle snapshot remains valid until the user-to-vehicle active assignment source exists.
   - Frontend hook no longer sends `p_active_vehicle_id`.

2. **Permission defaults were updated live in Supabase.**
   - Added the v2.6 express-related flags to `default_permissions_for_role`:
     - `can_express_checkout`
     - `can_approve_express_checkout`
     - `can_defer_completion`
   - Important repo caveat: the live Supabase migration succeeded, but the full repo migration file for the permission-default function replacement was blocked by the connector safety layer because of its size/shape. This still needs a clean repo migration representation.

3. **Controlled add-to-cart was implemented and verified.**
   - Added `add_inventory_cart_item(p_cart_id, p_bin_item_id, p_quantity)` as a `SECURITY DEFINER` RPC.
   - RPC checks:
     - authenticated Clerk JWT subject
     - active user permission record
     - `can_inventory_transactions`
     - active cart owned by signed-in user
     - valid `bin_item_id` / `item_id` relationship
     - quantity greater than zero
     - current available balance before adding
   - Add-to-cart only inserts/increments `inventory_cart_items`; it does not reserve stock, move inventory, create `transaction_items`, or affect balances.

4. **Stocked-bin candidate source was added.**
   - Added `inventory_cart_candidates_view` so the UI uses real stocked `bin_items`, not catalog-only `items` rows.
   - View exposes `bin_item_id`, `item_id`, bin info, item info, price, and `quantity_on_hand`.

5. **Normal checkout/finalization was implemented and verified.**
   - Added `finalize_inventory_cart(p_cart_id, p_destination_type, p_destination_id, p_note)` as a `SECURITY DEFINER` RPC.
   - RPC checks:
     - authenticated Clerk JWT subject
     - active user permission record
     - `can_inventory_transactions`
     - active cart owned by signed-in user
     - at least one cart item
     - valid destination type
     - destination ID required for job/service_call/vehicle/user
     - note required for unknown destination
     - current available balance before writing ledger rows
   - RPC writes an `inventory_transactions` header row.
   - RPC writes approved `transaction_items` rows with:
     - `status = 'approved'`
     - `occurred_at = NOW()`
     - `unit_cost_at_time = items.price_per_unit`
     - transaction type mapped from destination:
       - `job` / `service_call` → `assign_to_job`
       - `vehicle` → `assign_to_vehicle`
       - `vendor_return` → `vendor_return`
       - `scrap` → `scrap`
       - everything else → `remove_stock`
   - RPC updates cart item destination metadata.
   - RPC marks `inventory_carts.status = 'checked_out'`.
   - Existing balance trigger updates `inventory_balances` from approved ledger rows.

6. **Production behavior was verified by Ryan.**
   - Ryan verified the normal cart path updated Supabase correctly.
   - Verified path:
     - Open Cart
     - Add Item
     - Checkout to Office
     - Supabase ledger/balance updates appeared correctly

### Repo Commits Created This Session
- `a2a8e98` — Add vehicle holds stock flag migration
- `ffc9e14` — Harden open inventory cart permission gate
- `fd5d125` — Remove client vehicle parameter from cart open hook
- `868c27a` — Add inventory cart item RPC
- `9bcdc4f` — Add inventory cart candidates view
- `cdb4675` — Load inventory cart candidates from stocked bins
- `9de4814` — Wire cart candidates to add-to-cart RPC
- `b72ce95` — Add cart item hook action
- `afc72ee` — Add inventory cart checkout RPC
- `52c48b1` — Add inventory cart checkout hook action
- `701873f` — Expose inventory cart checkout button

### Current Verified Milestone
**Inventory Step 4C is complete and verified:**

```text
Open Cart → Add Item → Checkout to Office → approved transaction_items → balance update
```

### What Claude Needs to Review
Please review this implementation against `docs/ARCHITECTURE.md` v2.6 and HANDOFF Entries 016–017.

Specific questions:
1. Does the implemented cart-open / add-to-cart / normal checkout path align with Rules 1, 4, 5, 6, 9, 11, 15, and 16?
2. Is the `finalize_inventory_cart` destination handling acceptable as the first normal checkout implementation, especially the temporary UI path that checks out to `office`?
3. Is it acceptable that `finalize_inventory_cart` currently maps `office`, `user`, and `unknown` to `remove_stock` while preserving the per-line `destination_type` metadata?
4. Should `p_destination_type = 'office'` require a more specific destination ID or is the destination type sufficient for this first internal removal path?
5. Should the RPC require per-line destination fields now, or is cart-level destination acceptable for this first normal checkout milestone while per-line destinations are structurally supported on `transaction_items`?
6. Do the new express checkout permission flags being applied live before express implementation create any architecture concern, or is that acceptable because express checkout remains disabled in the UI?
7. Does the repo caveat need immediate correction before continuing: live Supabase permission defaults were updated, but the corresponding full migration file was not committed because the connector blocked the large function replacement?
8. Is this the right point to proceed to destination selection UI for job/service/vehicle/user/office, or should another foundation step come first?

### Known Caveats / Carry Forward
- Express checkout / manager override is still not built.
- Developer override is still not built.
- Approver passcode is still not built.
- User-to-vehicle active assignment source is still not built; vehicle snapshot remains NULL by design until that exists.
- Repo still needs a clean migration representation for the live `default_permissions_for_role` update that added v2.6 express flags.
- Destination tables/imports for employees/jobs/service calls/assemblies remain future work.
- Durable import/audit tracking remains future work.

### Proposed Next Step
Build **cart destination selection UI** before express checkout:
- Start with destination types supported by the existing RPC.
- Keep server-side validation authoritative.
- Avoid express checkout until Claude approves this normal checkout path.

---

## Copy/paste prompt for Claude

Claude, please review this Entry 018 implementation checkpoint against `docs/ARCHITECTURE.md` v2.6 and HANDOFF Entries 016–017. Focus on whether the implemented normal cart path maintains the locked inventory ledger rules, permission rules, audit/source-of-truth boundaries, per-line destination requirements, and separation between normal checkout and future express checkout. Flag any architecture drift, required schema changes, or sequencing corrections before the next build step.
