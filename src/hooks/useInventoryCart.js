import { useAuth, useUser } from '@clerk/clerk-react';
import { useCallback, useState } from 'react';
import { createSupabaseClient } from '../services/supabaseClient.js';

export function useInventoryCart() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [cart, setCart] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const [checkoutResult, setCheckoutResult] = useState(null);
  const [isOpening, setIsOpening] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState(null);

  const getClient = useCallback(async () => {
    const token = await getToken({ template: 'supabase' });
    return createSupabaseClient(token);
  }, [getToken]);

  const openCart = useCallback(async () => {
    setIsOpening(true);
    setError(null);

    try {
      const client = await getClient();
      const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Unknown User';

      const { data, error: rpcError } = await client.rpc('open_inventory_cart', {
        p_user_name: displayName,
      });

      if (rpcError) {
        throw rpcError;
      }

      const openedCart = Array.isArray(data) ? data[0] : data;
      setCart(openedCart ?? null);
      setCheckoutResult(null);
      return openedCart ?? null;
    } catch (caughtError) {
      console.error('Failed to open inventory cart', caughtError);
      setError(caughtError);
      return null;
    } finally {
      setIsOpening(false);
    }
  }, [getClient, user]);

  const addItem = useCallback(async ({ cartId, binItemId, quantity = 1 }) => {
    setIsAddingItem(true);
    setError(null);

    try {
      const client = await getClient();
      const { data, error: rpcError } = await client.rpc('add_inventory_cart_item', {
        p_cart_id: cartId,
        p_bin_item_id: binItemId,
        p_quantity: quantity,
      });

      if (rpcError) {
        throw rpcError;
      }

      const cartItem = Array.isArray(data) ? data[0] : data;
      setCartItems((currentItems) => {
        if (!cartItem?.cart_item_id) {
          return currentItems;
        }

        const withoutUpdated = currentItems.filter((item) => item.cart_item_id !== cartItem.cart_item_id);
        return [...withoutUpdated, cartItem];
      });
      return cartItem ?? null;
    } catch (caughtError) {
      console.error('Failed to add inventory cart item', caughtError);
      setError(caughtError);
      return null;
    } finally {
      setIsAddingItem(false);
    }
  }, [getClient]);

  const checkoutCart = useCallback(async ({
    cartId,
    destinationType = 'office',
    destinationId = null,
    note = null,
    lineDestinations = null,
  }) => {
    setIsCheckingOut(true);
    setError(null);

    try {
      const client = await getClient();
      const { data, error: rpcError } = await client.rpc('finalize_inventory_cart', {
        p_cart_id: cartId,
        p_destination_type: destinationType,
        p_destination_id: destinationId,
        p_note: note,
        p_line_destinations: lineDestinations,
      });

      if (rpcError) {
        throw rpcError;
      }

      const result = Array.isArray(data) ? data[0] : data;
      setCheckoutResult(result ?? null);
      setCart((currentCart) => currentCart ? { ...currentCart, status: 'checked_out' } : currentCart);
      return result ?? null;
    } catch (caughtError) {
      console.error('Failed to checkout inventory cart', caughtError);
      setError(caughtError);
      return null;
    } finally {
      setIsCheckingOut(false);
    }
  }, [getClient]);

  return {
    cart,
    cartItems,
    checkoutResult,
    error,
    isAddingItem,
    isCheckingOut,
    isOpening,
    addItem,
    checkoutCart,
    openCart,
  };
}
