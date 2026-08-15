import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) throw new Error('Missing VITE_SUPABASE_URL');
if (!supabaseAnonKey) throw new Error('Missing VITE_SUPABASE_ANON_KEY');

/**
 * Always construct with the caller's Clerk token.
 *
 * v2 also exported a module-level `supabase` built with no token. It was never
 * used, but an unauthenticated client sitting in scope under that name is a
 * footgun: any query written against it runs anonymously and returns whatever
 * RLS allows anonymous callers, which looks like an empty-data bug rather than
 * an auth bug. Not carried over. (Drift register D-08.)
 */
export function createSupabaseClient(accessToken) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  });
}
