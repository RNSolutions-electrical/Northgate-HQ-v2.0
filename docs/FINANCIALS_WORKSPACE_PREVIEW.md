# Financials workspace review candidate

Staging: Jobs → job → Financials → Open Financials Workspace. Open Forecast is
still the separate quick worksheet. The new workspace uses the native HQ
shell, authorized job lines, existing effective budget, and the existing
version-checked financial batch save. No migration or Production switch.

- Overview keeps recorded budget, booked actual, monthly and completion amounts
  separate. Budget & actuals shows the job lines. Forecast to finish supports
  crew days/hours, a quoted-plus-unquoted material allowance, or remaining dollars,
  plus a separate monthly entry and optional incurred-but-unposted costs.
- A review/save writes only changed forecast totals; breakdown and cutoff remain
  session context. Blank is unchanged; zero is explicit. Old saved forecasts
  are never used as newly incurred costs.
- Existing billing, change orders, documents, and cost imports remain in their
  existing HQ views. This slice does not add phase allocation, AI extraction,
  forecast assumption persistence, or billing automation.
- Example test: 100 booked + 25 unposted + 3 workers × 2 days × 8 hrs/day ×
  50/hr = 2,525 completion. Save a distinct 35 monthly forecast, reopen,
  and verify the actual is unchanged. Use a synthetic job for automated writes.
