// Display signed currency balances at cent precision, including zero-budget costs
// and credits. This does not change the budget or cost source values.
export function signedBudgetBalance(currentBudget, costs) {
  return (Math.round(Number(currentBudget || 0) * 100) - Math.round(Number(costs || 0) * 100)) / 100;
}

export function budgetBalanceClass(balance) {
  return balance < 0 ? 'is-negative' : balance > 0 ? 'is-positive' : 'is-neutral';
}
