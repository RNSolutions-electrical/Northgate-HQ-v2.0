export function hasCurrentBudgetOverride(line) {
  return line.current_budget_override_amount !== null
    && line.current_budget_override_amount !== undefined;
}

export function calculatedCurrentBudget(line, approvedChangeOrders = 0) {
  return Number(line.budget_amount || 0) + Number(line.budget_change_amount || 0)
    + Number(approvedChangeOrders || 0);
}

export function effectiveCurrentBudget(line, approvedChangeOrders = 0) {
  return hasCurrentBudgetOverride(line)
    ? Number(line.current_budget_override_amount)
    : calculatedCurrentBudget(line, approvedChangeOrders);
}
