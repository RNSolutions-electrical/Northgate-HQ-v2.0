-- Immediate containment: these legacy tables are not public content and the
-- application always authenticates through Clerk before accessing them.
REVOKE ALL ON TABLE
  public.cost_codes,
  public.vendors,
  public.items,
  public.storage_units,
  public.shelves,
  public.bays,
  public.bins,
  public.bin_items,
  public.change_logs,
  public.vehicles,
  public.inventory_transactions,
  public.transaction_items,
  public.inventory_balances,
  public.vehicle_bins,
  public.vehicle_bin_items,
  public.notifications
FROM anon;
