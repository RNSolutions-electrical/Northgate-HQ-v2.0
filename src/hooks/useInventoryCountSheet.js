import { useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { createSupabaseClient } from '../services/supabaseClient.js';

const EMPTY_ROWS = Object.freeze([]);

export function useInventoryCountSheet({ enabled }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    rows: EMPTY_ROWS,
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
        }));
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);

        const { data: candidates, error: candidatesError } = await client
          .from('inventory_cart_candidates_view')
          .select(
            'bin_item_id,item_id,bin_id,bin_code,bin_label,material_code,item_name,unit_of_measure,division,price_per_unit,quantity_on_hand,min_quantity',
          )
          .order('bin_code', { ascending: true })
          .order('material_code', { ascending: true })
          .limit(500);

        if (candidatesError) {
          throw candidatesError;
        }

        const candidateRows = candidates ?? [];
        const itemIds = [...new Set(candidateRows.map((row) => row.item_id).filter(Boolean))];
        const binIds = [...new Set(candidateRows.map((row) => row.bin_id).filter(Boolean))];

        const [
          itemsResult,
          binsResult,
        ] = await Promise.all([
          itemIds.length
            ? client
              .from('items')
              .select('id,broad_category,sub_category,sub_category_2,sub_category_3,sub_category_4')
              .in('id', itemIds)
            : Promise.resolve({ data: [], error: null }),
          binIds.length
            ? client
              .from('bins')
              .select('id,bin_code,label,bay_id')
              .in('id', binIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (itemsResult.error ?? binsResult.error) {
          throw itemsResult.error ?? binsResult.error;
        }

        const binRows = binsResult.data ?? [];
        const bayIds = [...new Set(binRows.map((row) => row.bay_id).filter(Boolean))];
        const baysResult = bayIds.length
          ? await client
            .from('bays')
            .select('id,bay_code,label,shelf_id')
            .in('id', bayIds)
          : { data: [], error: null };

        if (baysResult.error) {
          throw baysResult.error;
        }

        const bayRows = baysResult.data ?? [];
        const shelfIds = [...new Set(bayRows.map((row) => row.shelf_id).filter(Boolean))];
        const shelvesResult = shelfIds.length
          ? await client
            .from('shelves')
            .select('id,shelf_code,label,unit_id')
            .in('id', shelfIds)
          : { data: [], error: null };

        if (shelvesResult.error) {
          throw shelvesResult.error;
        }

        const shelfRows = shelvesResult.data ?? [];
        const storageUnitIds = [...new Set(shelfRows.map((row) => row.unit_id).filter(Boolean))];
        const storageUnitsResult = storageUnitIds.length
          ? await client
            .from('storage_units')
            .select('id,unit_code,name,division')
            .in('id', storageUnitIds)
          : { data: [], error: null };

        if (storageUnitsResult.error) {
          throw storageUnitsResult.error;
        }

        const itemById = new Map((itemsResult.data ?? []).map((row) => [row.id, row]));
        const binById = new Map(binRows.map((row) => [row.id, row]));
        const bayById = new Map(bayRows.map((row) => [row.id, row]));
        const shelfById = new Map(shelfRows.map((row) => [row.id, row]));
        const storageUnitById = new Map((storageUnitsResult.data ?? []).map((row) => [row.id, row]));
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
