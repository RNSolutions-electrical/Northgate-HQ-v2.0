import { useAuth } from '@clerk/clerk-react';
import { useCallback, useState } from 'react';
import { createSupabaseClient } from '../services/supabaseClient.js';

export function useInventoryCountIntake() {
  const { getToken } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const recordCount = useCallback(async ({ binId, itemId, countedQuantity, reason }) => {
    setIsRecording(true);
    setError(null);
    setResult(null);

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error: rpcError } = await client.rpc('intake_inventory_count', {
        p_bin_id: binId,
        p_item_id: itemId,
        p_counted_quantity: countedQuantity,
        p_reason: reason,
      });

      if (rpcError) {
        throw rpcError;
      }

      const nextResult = Array.isArray(data) ? data[0] : data;
      setResult(nextResult ?? null);
      return nextResult ?? null;
    } catch (caughtError) {
      console.error('Failed to record inventory count intake', caughtError);
      setError(caughtError);
      return null;
    } finally {
      setIsRecording(false);
    }
  }, [getToken]);

  return {
    error,
    isRecording,
    result,
    recordCount,
  };
}
