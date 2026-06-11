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
  const [isRemovingItem, setIsRemovingItem] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isReadingItems, setIsReadingItems] = useState(false);
  const [error, setError] = useState(null);

  const getClient = useCallback(async () => {
    const token = await getToken({ template: 'supabase' });
    return createSupabaseClient(token);
  }, [getToken]);

  const readCartItems = useCallback(async (cartId, clientOverride = null) => {
    if (!cartId) {
      setCartItems([]);
      return [];
    }

    setIsReadingItems(true);

    try {
      const client = clientOverride ?? await getClient();
      const { data, error: rpcError } = await client.rpc('read_inventory_cart_items', {
        p_cart_id: cartId,
      });

      if (rpcError) {
        throw rpcError;
      }

      const rows = data ?? [];
      setCartItems(rows);
      return rows;
    } catch (caughtError) {
      console.error('Failed to read inventory cart items', caughtError);
      setError(caughtError);
      return [];
    } finally {
      setIsReadingItems(false);
    }
  }, [getClient]);

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

      if (openedCart?.cart_id) {
        await readCartItems(openedCart.cart_id, client);
      }

      return openedCart ?? null;
    } catch (caughtError) {
      console.error('Failed to open inventory cart', caughtError);
      setError(caughtError);
      return null;
    } finally {
      setIsOpening(false);
    }
  }, [getClient, readCartItems, user]);

  const addItem = useCallback(async ({ cartId, binItemId, quantity = 1 }) => {
    setIsAddingItem(true);
    setError(null);

    try {
      const client = await getClient();
      const { error: rpcError } = await client.rpc('add_inventory_cart_item', {
        p_cart_id: cartId,
        p_bin_item_id: binItemId,
        p_quantity: quantity,
      });

      if (rpcError) {
        throw rpcError;
      }

      const rows = await readCartItems(cartId, client);
      return rows;
    } catch (caughtError) {
      console.error('Failed to add inventory cart item', caughtError);
      setError(caughtError);
      return null;
    } finally {
      setIsAddingItem(false);
    }
  }, [getClient, readCartItems]);

  const removeItem = useCallback(async ({ cartId, cartItemId }) => {
    setIsRemovingItem(true);
    setError(null);

    try {
      const client = await getClient();
      const { data, error: rpcError } = await client.rpc('remove_inventory_cart_item', {
        p_cart_item_id: cartItemId,
      });

      if (rpcError) {
        throw rpcError;
      }

      const result = Array.isArray(data) ? data[0] : data;
      await readCartItems(cartId, client);
      return result ?? null;
    } catch (caughtError) {
      console.error('Failed to remove inventory cart item', caughtError);
      setError(caughtError);
      return null;
    } finally {
      setIsRemovingItem(false);
    }
  }, [getClient, readCartItems]);

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
      await readCartItems(cartId, client);
      return result ?? null;
    } catch (caughtError) {
      console.error('Failed to checkout inventory cart', caughtError);
      setError(caughtError);
      return null;
    } finally {
      setIsCheckingOut(false);
    }
  }, [getClient, readCartItems]);

  return {
    cart,
    cartItems,
    checkoutResult,
    error,
    isAddingItem,
    isRemovingItem,
    isCheckingOut,
    isOpening,
    isReadingItems,
    addItem,
    removeItem,
    checkoutCart,
    openCart,
    readCartItems,
  };
}
