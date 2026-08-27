export function grossProfit(revenue, totalHardCost) {
  return Number(revenue || 0) - Number(totalHardCost || 0);
}

export function grossMargin(revenue, totalHardCost) {
  const normalizedRevenue = Number(revenue || 0);
  if (normalizedRevenue === 0) return null;
  return (grossProfit(normalizedRevenue, totalHardCost) / normalizedRevenue) * 100;
}

export function servicePerformanceTotals(rows) {
  return rows.reduce((sum, row) => ({
    revenue: sum.revenue + Number(row.invoiced_revenue || 0),
    collected: sum.collected + Number(row.collected || 0),
    cost: sum.cost + Number(row.total_hard_cost || 0),
    profit: sum.profit + Number(row.gross_profit ?? grossProfit(row.invoiced_revenue, row.total_hard_cost)),
    outstanding: sum.outstanding + Number(row.outstanding || 0),
  }), { revenue: 0, collected: 0, cost: 0, profit: 0, outstanding: 0 });
}

export function weightedGrossMargin(rows) {
  const totals = servicePerformanceTotals(rows);
  return totals.revenue === 0 ? null : (totals.profit / totals.revenue) * 100;
}
