export const PRODUCTION_SUPABASE_REF = 'keogysnoukbendfkfjcn';

export function resolveAppEnvironment(env = {}) {
  const name = String(env.VITE_APP_ENV || 'production').trim().toLowerCase();
  if (!['production', 'staging', 'development'].includes(name)) {
    throw new Error('VITE_APP_ENV must be production, staging, or development.');
  }
  return name;
}

export function validateBuildEnvironment(env = {}) {
  const name = resolveAppEnvironment(env);
  const branch = String(env.BRANCH || '').trim().toLowerCase();
  const context = String(env.CONTEXT || '').trim().toLowerCase();
  const supabaseUrl = String(env.VITE_SUPABASE_URL || '').trim();
  const projectRef = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i.exec(supabaseUrl)?.[1];

  if (context && context !== 'production' && name === 'production') {
    throw new Error('A non-production deploy must set VITE_APP_ENV explicitly.');
  }
  if (branch && branch !== 'main' && name === 'production') {
    throw new Error('A non-main branch cannot build with the Production environment identity.');
  }
  if (name !== 'production' && (!projectRef || projectRef === PRODUCTION_SUPABASE_REF)) {
    throw new Error('Staging and Development builds require an isolated Supabase project URL.');
  }
  return name;
}

export function validateRuntimeEnvironment(env = {}, isDevServer = false) {
  const name = validateBuildEnvironment(env);
  if (isDevServer && name === 'production') {
    throw new Error('Local development must set VITE_APP_ENV=development and use an isolated Supabase project.');
  }
  return name;
}
