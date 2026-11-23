# Job Financials landing: first Staging review

Open Jobs → a project → Financials. The overview uses the existing authorized job
budget, revenue and change-order readers. No new storage, writes, schema changes,
or staging-to-production data moves. The underlying editable budget table, cost
report import, SOV, billing history and forecast tools are unchanged.

- The approved change amount uses the current approved revision in each family,
  includes credits, and fails closed on conflicting or incomplete revision history.
  The drill-down lists those same current records. SOV allocation is a separate
  amount, not a source for the signed price or approval total.
- Existing jobs have no confirmed original contract field that this screen can
  read. Original/current contract shows unavailable instead of inferring a number
  from the SOV, a cost budget, or an estimate. The calculation is tested with a
  synthetic $100,000 baseline and $10,000 change before and after SOV allocation.
- The overview shows the saved cost-code working budget, execution
  values excluding fee lines and separate CO price postings, posted actuals, remaining budget and saved completion forecast. It
  does not change where posted actuals or forecast values are written.
- Not in this slice: a signed contract baseline writer, new Sales Budget
  allocator, separate approve/post workflow, source reconciliation or payment
  status, forecast snapshot/export changes, discipline-level drill-down and
  broader job navigation/Gantt changes.
