import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { uiElementAttributes } from '../../config/uiTerminology.js';
import { money } from './serviceCallModel.js';
import { profitYears, summarizeProfit } from './serviceProfit.js';

const BASIS_LABELS = { invoice: 'Latest invoice date', service: 'Service date', paid: 'Latest payment date' };
export function ServiceProfitSummary({ calls, period, onChange, today }) {
  const years = profitYears(calls, period.basis, Number(today.slice(0, 4)));
  const ytd = summarizeProfit(calls, { ...period, quarter: 'all', through: today });
  const selected = summarizeProfit(calls, { ...period, through: today });
  const yearLabel = Number(period.year) === Number(today.slice(0, 4)) ? `${period.year} YTD` : `${period.year} year`;
  const profit = (value) => value === null ? 'Not available' : money(value);
  const margin = (value) => value === null ? 'Not available' : value.toFixed(1) + '%';
  return <section className="svc-profit-summary" aria-label="Service call profit summary" {...uiElementAttributes('MODULE','Service Call Profit Summary')}>
    <div className="svc-actions">
      <h2>Service call profit</h2>
      <label>Reporting year<select aria-label="Reporting year" value={period.year} onChange={(e) => onChange({ ...period, year: Number(e.target.value) })}>
        {years.map((year) => <option key={year} value={year}>{year}</option>)}
      </select></label>
      <label>Reporting quarter<select aria-label="Reporting quarter" value={period.quarter} onChange={(e) => onChange({ ...period, quarter: e.target.value })}>
        <option value="all">All quarters</option>{[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
      </select></label>
      <label>Group calls by<select aria-label="Group calls by" value={period.basis} onChange={(e) => onChange({ ...period, basis: e.target.value })}>
        {Object.entries(BASIS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
    </div>
    <div className="module-fact-grid">
      <SummaryCard label={`${yearLabel} profit`} value={profit(ytd.profit)} detail={`${ytd.included} calls with recorded costs`} />
      <SummaryCard label={`${yearLabel} profit margin`} value={margin(ytd.margin)} detail="Total profit ÷ matching net revenue" />
      <SummaryCard label={period.quarter === 'all' ? 'Selected period profit' : `Q${period.quarter} profit`} value={profit(selected.profit)} detail={`${selected.included} calls with recorded costs`} />
      <SummaryCard label={period.quarter === 'all' ? 'Selected period profit margin' : `Q${period.quarter} profit margin`} value={margin(selected.margin)} detail={`${money(selected.revenue)} net revenue in calculation`} />
    </div>
    <p className="svc-profit-note">Each call’s total billed revenue less its current recorded costs, grouped by {BASIS_LABELS[period.basis].toLowerCase()}. Includes archived calls; excludes void calls and sales tax. These are call-profit groups, not period cash flow. Directory search and work-stage filters do not change these totals.</p>
    {(ytd.missingCost > 0 || ytd.undated > 0 || ytd.preliminary > 0) && <p role="status">
      {ytd.missingCost > 0 && `${ytd.missingCost} calls in the year lack costs and are excluded. `}
      {ytd.undated > 0 && `${ytd.undated} calls have no reporting date and are excluded. `}
      {ytd.preliminary > 0 && `${ytd.preliminary} included calls have preliminary costs. `}
      Profit totals remain provisional until these records are reviewed.
    </p>}
  </section>;
}
