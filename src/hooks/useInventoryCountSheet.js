import { useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { createSupabaseClient } from '../services/supabaseClient.js';

const EMPTY_ROWS = Object.freeze([]);
const EMPTY_COLLECTION = Object.freeze([]);

export function useInventoryCountSheet({ enabled }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    rows: EMPTY_ROWS,
    catalogItems: EMPTY_COLLECTION,
    storageUnits: EMPTY_COLLECTION,
    shelves: EMPTY_COLLECTION,
    bays: EMPTY_COLLECTION,
    bins: EMPTY_COLLECTION,
    lastLoadedAt: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadCountSheet() {
      if (!enabled) {
        setState((current) => ({
          ...current,
          isLoading: false,
          rows: EMPTY_ROWS,
          catalogItems: EMPTY_COLLECTION,
          storageUnits: EMPTY_COLLECTION,
          shelves: EMPTY_COLLECTION,
          bays: EMPTY_COLLECTION,
          bins: EMPTY_COLLECTION,
        }));
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);

        const [
          candidatesResult,
          itemsResult,
          binsResult,
          baysResult,
          shelvesResult,
          storageUnitsResult,
        ] = await Promise.all([
          client
            .from('inventory_cart_candidates_view')
            .select(
              'bin_item_id,item_id,bin_id,bin_code,bin_label,material_code,item_name,unit_of_measure,division,price_per_unit,quantity_on_hand,min_quantity',
            )
            .order('bin_code', { ascending: true })
            .order('material_code', { ascending: true })
            .limit(1000),
          client
            .from('items')
            .select('*')
            .eq('is_active', true)
            .eq('is_archived', false)
            .order('material_code', { ascending: true })
            .limit(1000),
          client
            .from('bins')
            .select('id,bin_code,label,bay_id,position')
            .order('position', { ascending: true })
            .order('bin_code', { ascending: true }),
          client
            .from('bays')
            .select('id,bay_code,label,shelf_id,position')
            .order('position', { ascending: true })
            .order('bay_code', { ascending: true }),
          client
            .from('shelves')
            .select('id,shelf_code,label,unit_id,position')
            .order('position', { ascending: true })
            .order('shelf_code', { ascending: true }),
          client
            .from('storage_units')
            .select('id,unit_code,name,division')
            .order('unit_code', { ascending: true }),
        ]);

        if (
          candidatesResult.error ??
          itemsResult.error ??
          binsResult.error ??
          baysResult.error ??
          shelvesResult.error ??
          storageUnitsResult.error
        ) {
          throw (
            candidatesResult.error ??
            itemsResult.error ??
            binsResult.error ??
            baysResult.error ??
            shelvesResult.error ??
            storageUnitsResult.error
          );
        }

        const candidateRows = candidatesResult.data ?? [];
        const catalogItems = itemsResult.data ?? [];
        const binRows = binsResult.data ?? [];
        const bayRows = baysResult.data ?? [];
        const shelfRows = shelvesResult.data ?? [];
        const storageUnitRows = storageUnitsResult.data ?? [];

        const itemById = new Map(catalogItems.map((row) => [row.id, row]));
        const binById = new Map(binRows.map((row) => [row.id, row]));
        const bayById = new Map(bayRows.map((row) => [row.id, row]));
        const shelfById = new Map(shelfRows.map((row) => [row.id, row]));
        const storageUnitById = new Map(storageUnitRows.map((row) => [row.id, row]));
        const rows = candidateRows.map((row) => {
          const item = itemById.get(row.item_id) ?? {};
          const bin = binById.get(row.bin_id) ?? {};
          const bay = bayById.get(bin.bay_id) ?? {};
          const shelf = shelfById.get(bay.shelf_id) ?? {};
          const storageUnit = storageUnitById.get(shelf.unit_id) ?? {};

          return {
            ...row,
            broad_category: item.broad_category ?? null,
            sub_category: item.sub_category ?? null,
            sub_category_2: item.sub_category_2 ?? null,
            sub_category_3: item.sub_category_3 ?? null,
            sub_category_4: item.sub_category_4 ?? null,
            manufacturer: item.manufacturer ?? null,
            manufacturer_sub: item.manufacturer_sub ?? null,
            manufacturer_part_number:
              item.manufacturer_part_number ??
              item.manufacturer_part_no ??
              item.mfr_part_number ??
              item.mpn ??
              null,
            vendor_part_number:
              item.vendor_part_number ??
              item.vendor_part_no ??
              item.vendor_part ??
              item.vendor_sku ??
              item.vpn ??
              null,
            description: item.description ?? null,
            bay_id: bay.id ?? null,
            bay_code: bay.bay_code ?? '',
            bay_label: bay.label ?? '',
            shelf_id: shelf.id ?? null,
            shelf_code: shelf.shelf_code ?? '',
            shelf_label: shelf.label ?? '',
            storage_unit_id: storageUnit.id ?? null,
            storage_unit_code: storageUnit.unit_code ?? '',
            storage_unit_name: storageUnit.name ?? '',
            storage_unit_division: storageUnit.division ?? '',
            system_quantity: row.quantity_on_hand,
          };
        });

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            rows,
            catalogItems,
            storageUnits: storageUnitRows,
            shelves: shelfRows,
            bays: bayRows,
            bins: binRows,
            lastLoadedAt: new Date().toISOString(),
          });
        }
      } catch (caughtError) {
        console.error('Failed to load inventory count sheet', caughtError);
        if (isMounted) {
          setState({
            isLoading: false,
            error: caughtError,
            rows: EMPTY_ROWS,
            catalogItems: EMPTY_COLLECTION,
            storageUnits: EMPTY_COLLECTION,
            shelves: EMPTY_COLLECTION,
            bays: EMPTY_COLLECTION,
            bins: EMPTY_COLLECTION,
            lastLoadedAt: null,
          });
        }
      }
    }

    loadCountSheet();

    return () => {
      isMounted = false;
    };
  }, [enabled, getToken, refreshKey]);

  return {
    ...state,
    reload: () => setRefreshKey((current) => current + 1),
  };
}
