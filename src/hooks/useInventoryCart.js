import { useAuth, useUser } from '@clerk/clerk-react';
import { useCallback, useState } from 'react';
import { createSupabaseClient } from '../services/supabaseClient.js';

export function useInventoryCart() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [cart, setCart] = useState(null);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState(null);

  const openCart = useCallback(async () => {
    setIsOpening(true);
    setError(null);

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || user?.id || 'Unknown User';

      const { data, error: rpcError } = await client.rpc('open_inventory_cart', {
        p_user_name: displayName,
        p_active_vehicle_id: null,
      });

      if (rpcError) {
        throw rpcError;
      }

      const openedCart = Array.isArray(data) ? data[0] : data;
      setCart(openedCart ?? null);
      return openedCart ?? null;
    } catch (caughtError) {
      console.error('Failed to open inventory cart', caughtError);
      setError(caughtError);
      return null;
    } finally {
      setIsOpening(false);
    }
  }, [getToken, user]);

  return {
    cart,
    error,
    isOpening,
    openCart,
  };
}
