import { useAuth } from '@clerk/clerk-react';
import { useCallback, useState } from 'react';
import { createSupabaseClient } from '../services/supabaseClient.js';

export function useInventoryCountCorrection() {
  const { getToken } = useAuth();
  const [isSettingQuantity, setIsSettingQuantity] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const setCountQuantity = useCallback(async ({ binItemId, targetQuantity, reason }) => {
    setIsSettingQuantity(true);
    setError(null);
    setResult(null);

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error: rpcError } = await client.rpc('set_inventory_count_quantity', {
        p_bin_item_id: binItemId,
        p_target_quantity: targetQuantity,
        p_reason: reason,
      });

      if (rpcError) {
        throw rpcError;
      }

      const nextResult = Array.isArray(data) ? data[0] : data;
      setResult(nextResult ?? null);
      return nextResult ?? null;
    } catch (caughtError) {
      console.error('Failed to set inventory count quantity', caughtError);
      setError(caughtError);
      return null;
    } finally {
      setIsSettingQuantity(false);
    }
  }, [getToken]);

  return {
    error,
    isSettingQuantity,
    result,
    setCountQuantity,
  };
}
