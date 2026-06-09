import { useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { createSupabaseClient } from '../services/supabaseClient.js';

const EMPTY_MODEL = Object.freeze({
  counts: {
    activeItems: 0,
    storageUnits: 0,
    shelves: 0,
    bays: 0,
    bins: 0,
    binItems: 0,
    inventoryBalances: 0,
    grandMasterRows: 0,
  },
  catalogPreview: [],
  storageUnitsPreview: [],
  binsPreview: [],
});

async function getCount(client, table, queryBuilder) {
  let query = client.from(table).select('*', { count: 'exact', head: true });

  if (queryBuilder) {
    query = queryBuilder(query);
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export function useInventoryReadModel({ enabled }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    model: EMPTY_MODEL,
    lastLoadedAt: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled) {
        setState((current) => ({
          ...current,
          isLoading: false,
        }));
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);

        const [
          activeItems,
          storageUnits,
          shelves,
          bays,
          bins,
          binItems,
          inventoryBalances,
          grandMasterRows,
          catalogPreviewResult,
          storageUnitsPreviewResult,
          binsPreviewResult,
        ] = await Promise.all([
          getCount(client, 'items', (query) =>
            query.eq('is_active', true).eq('is_archived', false),
          ),
          getCount(client, 'storage_units'),
          getCount(client, 'shelves'),
          getCount(client, 'bays'),
          getCount(client, 'bins'),
          getCount(client, 'bin_items'),
          getCount(client, 'inventory_balances'),
          getCount(client, 'grand_master_inventory_view'),
          client
            .from('items')
            .select(
              'id, material_code, name, broad_category, sub_category, unit_of_measure, division, price_per_unit',
            )
            .eq('is_active', true)
            .eq('is_archived', false)
            .order('name', { ascending: true })
            .limit(10),
          client
            .from('storage_units')
            .select('id, unit_code, name, division')
            .order('unit_code', { ascending: true })
            .limit(10),
          client
            .from('bins')
            .select('id, bin_code, label, qr_code')
            .order('bin_code', { ascending: true })
            .limit(10),
        ]);

        const readError =
          catalogPreviewResult.error ??
          storageUnitsPreviewResult.error ??
          binsPreviewResult.error;

        if (readError) {
          throw readError;
        }

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            model: {
              counts: {
                activeItems,
                storageUnits,
                shelves,
                bays,
                bins,
                binItems,
                inventoryBalances,
                grandMasterRows,
              },
              catalogPreview: catalogPreviewResult.data ?? [],
              storageUnitsPreview: storageUnitsPreviewResult.data ?? [],
              binsPreview: binsPreviewResult.data ?? [],
            },
            lastLoadedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Failed to load inventory read model', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            model: EMPTY_MODEL,
            lastLoadedAt: null,
          });
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [enabled, getToken, refreshKey]);

  return {
    ...state,
    reload: () => setRefreshKey((current) => current + 1),
  };
}
