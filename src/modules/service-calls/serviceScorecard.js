import { callFinancials, directoryStatus } from './serviceCallModel.js';
import { isVoidCall, profitDate, summarizeProfit } from './serviceProfit.js';

// Reporting shares the Jobs scorecard's authorized payload and calculation rules.
export function monthlyServiceProfit(calls, period) {
  return Array.from({length:12}, (_, index) => index + 1)
    .filter(month => period.quarter === 'all' || !period.quarter || Math.ceil(month / 3) === Number(period.quarter))
    .map(month => {
      const key = `${period.year}-${String(month).padStart(2,'0')}`;
      const matching = calls.filter(call => profitDate(call, period.basis)?.startsWith(key));
      return {month:key, ...summarizeProfit(matching, {...period,quarter:'all'})};
    });
}

export function serviceAttention(call, today) {
  if (!call.financials || call.archived_at || isVoidCall(call)) return [];
  const f = callFinancials(call,today), reasons = [];
  if (call.profile?.work_stage === 'complete' && f.billingStatus === 'Not invoiced') reasons.push('Ready to invoice');
  if (f.outstanding > 0) reasons.push(f.billingStatus === 'Overdue' ? 'Payment overdue' : 'Payment outstanding');
  if (f.revenue > 0 && !f.costKnown) reasons.push('Costs missing');
  if (f.margin !== null && f.margin < 30) reasons.push('Margin below 30%');
  return reasons;
}

// Quoting alone does not prevent spreadsheet formula injection.
function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"','""') + '"';
}
export function serviceScorecardCsv(calls, period, today) {
  const header = ['Call #','Customer / call','Department','Scope','Reporting basis','Reporting date','Work stage','Archived','Subtotal billed (ex tax/fees)','Cost','Profit $','Profit %','Collected','Outstanding','Billing','Review','Sales tax','Credit card fee'];
  const rows = calls.filter(call=>call.financials).map(call => {
    const f = callFinancials(call,today), voided = isVoidCall(call);
    return [call.service_call_number,call.name,call.division,call.description,period.basis,profitDate(call,period.basis),
      directoryStatus(call,today).label,call.archived_at ? 'Yes' : 'No',
      ...[f.revenue,f.costKnown?f.cost:null,f.profit,f.margin,f.collected,f.outstanding].map(value=>voided ? null : value),
      voided?'Void':f.billingStatus,voided?'Void — excluded from profit':serviceAttention(call,today).join('; '),voided?null:f.tax,voided?null:f.cardFee];
  });
  return '\uFEFF' + [header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
