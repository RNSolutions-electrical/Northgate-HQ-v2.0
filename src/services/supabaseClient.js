import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
let cachedClient = null;
let cachedAccessToken = null;

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
  if (cachedClient && cachedAccessToken === accessToken) return cachedClient;

  cachedAccessToken = accessToken;
  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => accessToken,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cachedClient;
}

export function isJwtNotYetValidError(error) {
  return /jwt not yet valid/i.test(String(error?.message || error || ''));
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Clerk and Supabase can disagree by a fraction of a second at token issuance.
 * Retry only that explicit validity race with a freshly issued token; all other
 * authentication and authorization failures pass through unchanged.
 */
export async function withSupabaseTokenRetry(getToken, operation) {
  const delays = [0, 1200, 2400];
  let lastError;

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt]) await pause(delays[attempt]);

    try {
      const token = await getToken({
        template: 'supabase',
        ...(attempt > 0 ? { skipCache: true } : {}),
      });
      return await operation(createSupabaseClient(token));
    } catch (error) {
      lastError = error;
      if (!isJwtNotYetValidError(error) || attempt === delays.length - 1) throw error;
    }
  }

  throw lastError;
}
