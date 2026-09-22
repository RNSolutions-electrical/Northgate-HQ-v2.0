import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { validateBuildEnvironment } from './src/lib/environmentContract.mjs';

// Deployed at rnsolutions.net/northgate — assets must resolve under that path.
// Override with VITE_BASE_PATH if the address ever changes.
const base = process.env.VITE_BASE_PATH
  ? `${process.env.VITE_BASE_PATH.replace(/\/$/, '')}/`
  : '/northgate/';

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
    const missing = ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','VITE_CLERK_PUBLISHABLE_KEY'].filter((key) => !env[key]?.trim());
    if (missing.length) throw new Error(`Build stopped: missing ${missing.join(', ')}. Load the target environment before building; do not deploy an unconfigured bundle.`);
    validateBuildEnvironment(env);
  }
  return {
  plugins: [react()],
  base,
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
  server: {
    allowedHosts: ['rnsolutions.net'],
  },
  build: { outDir: 'dist', sourcemap: false },
  };
});
