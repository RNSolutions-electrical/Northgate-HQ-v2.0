import { useAuth } from '@clerk/clerk-react';
import { useCallback, useEffect, useState } from 'react';
import { createSupabaseClient } from '../services/supabaseClient.js';

export function useInventoryTransactionHistory({
  enabled,
  limit = 50,
  transactionType = '',
  search = '',
}) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    rows: [],
    lastLoadedAt: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadHistory() {
      if (!enabled) {
        setState((current) => ({
          ...current,
          isLoading: false,
          rows: [],
        }));
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error: rpcError } = await client.rpc('read_inventory_transaction_history', {
          p_limit: limit,
          p_transaction_type: transactionType || null,
          p_search: search.trim() || null,
        });

        if (rpcError) {
          throw rpcError;
        }

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            rows: data ?? [],
            lastLoadedAt: new Date().toISOString(),
          });
        }
      } catch (caughtError) {
        console.error('Failed to load inventory transaction history', caughtError);
        if (isMounted) {
          setState({
            isLoading: false,
            error: caughtError,
            rows: [],
            lastLoadedAt: null,
          });
        }
      }
    }

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [enabled, getToken, limit, refreshKey, search, transactionType]);

  const reload = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  return {
    ...state,
    reload,
  };
}
