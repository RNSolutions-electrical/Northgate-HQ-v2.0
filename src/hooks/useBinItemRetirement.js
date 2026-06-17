import { useAuth } from '@clerk/clerk-react';
import { useCallback, useState } from 'react';
import { createSupabaseClient } from '../services/supabaseClient.js';

export function useBinItemRetirement() {
  const { getToken } = useAuth();
  const [isRetiring, setIsRetiring] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const retireBinItem = useCallback(async ({ binItemId, reason }) => {
    setIsRetiring(true);
    setError(null);
    setResult(null);

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { data, error: rpcError } = await client.rpc('retire_bin_item', {
        p_bin_item_id: binItemId,
        p_reason: reason,
      });

      if (rpcError) {
        throw rpcError;
      }

      const nextResult = Array.isArray(data) ? data[0] : data;
      setResult(nextResult ?? null);
      return nextResult ?? null;
    } catch (caughtError) {
      console.error('Failed to retire bin item', caughtError);
      setError(caughtError);
      return null;
    } finally {
      setIsRetiring(false);
    }
  }, [getToken]);

  return {
    error,
    isRetiring,
    result,
    retireBinItem,
  };
}
