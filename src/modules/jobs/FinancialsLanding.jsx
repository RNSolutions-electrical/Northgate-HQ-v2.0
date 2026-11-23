import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import './financialsLanding.css';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const display = (value, missing = 'Not recorded') => value == null ? missing : currency.format(value);

export function FinancialsLanding({ contract, budget, billing, forecasting, loading, hasIssues, canViewDetailed, navigationBlocked, onDetails, onBilling, onChangeOrders, onForecast, onQuickForecast }) {
  return <section className="financials-landing" aria-label="Financials overview">
    <header>
      <span className="eyebrow">Job financials · Staging</span>
      <h2>Financials overview</h2>
      <p>Review the job numbers here, then open the tool you need to update them.</p>
      {loading && <p role="status">Loading job records…</p>}
      {hasIssues && <p role="status">Some totals are unavailable. Open the relevant tool to review the underlying records.</p>}
    </header>
    <section className="financials-landing__section" aria-label="Contract and billing">
      <h3>Contract &amp; Billing</h3>
      <div className="summary-grid summary-grid--compact">
        <SummaryCard label="Original contract" value={display(contract.original)} detail="Confirmed contract amount, not the cost budget or SOV." />
        <SummaryCard label="Approved changes" value={display(contract.approved, 'Unavailable')} detail={contract.approved == null ? 'Approval totals could not be verified yet.' : `${contract.count} current approved changes, net of credits.`} />
        <SummaryCard label="Current contract" value={display(contract.current, 'Not available')} detail="Original contract plus approved changes." />
        <SummaryCard label="SOV allocated" value={display(contract.allocated)} detail={contract.unallocated == null ? 'Scheduled values plus changes assigned to SOV lines.' : `${display(Math.abs(contract.unallocated))} ${contract.unallocated < 0 ? 'over contract' : 'unallocated'}.`} />
        <SummaryCard label="Billed to date" value={display(billing.billed)} detail="Recorded billing, not collections." />
      </div>
      <div className="job-financials-quick-actions">
        <button type="button" className="secondary-button" disabled={navigationBlocked} onClick={onBilling}>Open SOV &amp; Billing</button>
        <button type="button" className="secondary-button" disabled={navigationBlocked || contract.approved == null} onClick={onChangeOrders}>Review approved changes</button>
      </div>
    </section>
    <section className="financials-landing__section" aria-label="Budgeting">
      <h3>Budgeting</h3>
      <div className="summary-grid summary-grid--compact">
        {canViewDetailed && <SummaryCard label="Detailed Budget" value={display(budget.detailed)} detail="Existing detailed budget total, including fee lines and posted changes." />}
        <SummaryCard label="Sales Budget" value="Not set up" detail="The sales allocation view is not part of this first Staging pass." />
        <SummaryCard label="Execution Budget" value={display(budget.execution)} detail="Working cost-code amounts, excluding fee lines and separate CO price postings." />
        <SummaryCard label="Posted actuals" value={display(budget.actual)} detail="Actual costs recorded on execution codes." />
        <SummaryCard label="Remaining cost budget" value={display(budget.remaining)} detail="Execution budget less posted actuals." tone={budget.remaining < 0 ? 'warn' : 'default'} />
      </div>
      <div className="job-financials-quick-actions">
        <button type="button" className="secondary-button" onClick={onDetails}>Go to budget lines</button>
      </div>
    </section>
    <section className="financials-landing__section" aria-label="Forecasting">
      <h3>Forecasting</h3>
      <div className="summary-grid summary-grid--compact">
        <SummaryCard label="Saved completion forecast" value={display(forecasting.completion)} detail="Saved forecast amounts on execution lines." />
      </div>
      {onForecast && <div className="job-financials-quick-actions">
        <button type="button" className="secondary-button" onClick={onForecast}>Open Financials Workspace</button>
        <button type="button" className="secondary-button" onClick={onQuickForecast}>Open quick forecast worksheet</button>
      </div>}
    </section>
  </section>;
}
