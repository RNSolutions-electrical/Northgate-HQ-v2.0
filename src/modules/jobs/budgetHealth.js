// Presentation-only classification. Never use this to change financial totals.
export function classifyBudgetHealth(budget, actual) {
  if (budget === null || budget === undefined || budget === '' || actual === null || actual === undefined || actual === '') {
    return { state: 'unavailable', label: 'N/A', remainingPercent: null };
  }
  const budgetValue = Number(budget);
  const actualValue = Number(actual);
  if (!Number.isFinite(budgetValue) || !Number.isFinite(actualValue) || budgetValue <= 0) {
    return { state: 'unavailable', label: 'N/A', remainingPercent: null };
  }
  const budgetCents = Math.round(budgetValue * 100);
  const actualCents = Math.round(actualValue * 100);
  const remainingPercent = ((budgetCents - actualCents) / budgetCents) * 100;
  if (actualCents > budgetCents) return { state: 'over-budget', label: 'OVER BUDGET', remainingPercent };
  if ((budgetCents - actualCents) * 100 <= budgetCents * 5) return { state: 'danger', label: 'Danger', remainingPercent };
  if ((budgetCents - actualCents) * 100 <= budgetCents * 20) return { state: 'warning', label: 'Warning', remainingPercent };
  return { state: 'healthy', label: 'Healthy', remainingPercent };
}
