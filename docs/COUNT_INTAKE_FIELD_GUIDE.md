# Count Intake Field Guide

This guide is for field use during Inventory Count / Count Intake review. It explains what the screen fields mean without changing the locked architecture.

## Narrow the Count Area

Use the path selectors from left to right:

- Unit narrows the count to one storage unit.
- Shelf narrows within the selected unit.
- Bay narrows within the selected shelf.
- Bin narrows to the exact bin being counted.

The search box also accepts compact location shortcuts:

- `C` means Unit C.
- `C1` means Unit C / Shelf 1.
- `C11` means Unit C / Shelf 1 / Bay 1.
- `C111` means Unit C / Shelf 1 / Bay 1 / Bin 1.

Ordinary text search still works for visible material, unit, shelf, bay, bin, and storage path text.

## Record Counts

Entering a counted quantity and pressing Record Count creates an official physical count correction through the approved Count Intake path.

- Zero is valid.
- Counted quantity is the physical quantity found in the bin.
- The system quantity remains useful context for variance review.
- Use Reason or Custom note to explain why the count is being recorded.
- Selected-bin catalog intake is for existing catalog items only.

Count Intake does not create catalog items from the count screen.

## Review Repeats

Review Repeats is a display/filter aid only. Use it to spot repeated meaningful values such as material code, material name, bin code, unit, shelf, bay, storage path, part numbers, or description.

It does not merge, delete, archive, retire, correct, or modify records.

## Retire Mistaken Bin/Material Rows

Retire is for a mistaken bin/material link after the row is at zero balance.

- If the row has quantity, first record a zero physical count correction.
- After the row is zero, use Retire with a required reason.
- Retire archives the bin/material link from active count/intake views.
- Retire does not change quantity.
- Retire does not write a ledger transaction.
- Transaction history remains preserved.

The Retire action remains Developer/Admin gated with `can_archive_records`.

## Quick QA Checklist

- Confirm the selected Unit / Shelf / Bay / Bin matches the physical area being counted.
- Test `C`, `C1`, `C11`, and `C111` search shortcuts when reviewing Unit C locations.
- Confirm ordinary material and location text search still works.
- Confirm zero count can be entered when the physical bin is empty.
- Confirm the reason/note describes the count event clearly.
- Confirm Review Repeats is used only for review, not cleanup.
- Confirm mistaken rows are zeroed first, then retired only when appropriate.
