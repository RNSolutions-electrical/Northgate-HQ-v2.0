/**
 * Production still uses the existing Clerk `supabase` JWT template. Staging
 * uses Clerk's native Supabase integration, which puts the authenticated role
 * on its normal session token. Keep this choice in one place so a later
 * production migration does not require another sweep of every module.
 */
export function supabaseTokenOptions(environment = 'production', options = {}) {
  return environment === 'staging'
    ? { ...options }
    : { template: 'supabase', ...options };
}

export function getSupabaseAccessToken(getToken, options = {}) {
  return getToken(supabaseTokenOptions(import.meta.env?.VITE_APP_ENV, options));
}
