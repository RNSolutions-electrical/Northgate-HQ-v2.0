# Forecast worksheet

Open **Jobs → job → Financials → Open Forecast** with the existing financial approval permission. This is a forecast-only slice of the financials rebuild, not a replacement for the existing job budgets, cost report or billing tools.

- HQ reads the job's existing, authorized financial lines. Verify the booked-actuals cutoff before forecasting. Monthly forecast is an independent dollar entry.
- Completion projection uses booked actuals + optional incurred-but-unposted costs + remaining work. Enter remaining work in dollars or hours times the supplied cost rate. Confirm that the incurred amount is not already booked or included in the remaining work.
- Blank inputs make no change. Zero is an explicit input. Save sends only changed forecast dollar fields plus each line's observed revision to HQ's existing financial batch RPC. The calculation inputs and cutoffs are not persisted by this initial worksheet. No migration, permission changes, or production data copy.
- Staging check: open a synthetic job with existing unlocked financial lines, verify both dollar and labor-hours paths, confirm save/reopen, and verify actuals, budget and billing do not change. Verify a concurrent edit rejects the batch and preserves the draft for review. Check that a read-only role cannot access the worksheet. Do not test writes on a real project.
