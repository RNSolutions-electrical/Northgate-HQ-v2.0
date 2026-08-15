import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed at rnsolutions.net/northgate — assets must resolve under that path.
// Override with VITE_BASE_PATH if the address ever changes.
const base = process.env.VITE_BASE_PATH
  ? `${process.env.VITE_BASE_PATH.replace(/\/$/, '')}/`
  : '/northgate/';

export default defineConfig({
  plugins: [react()],
  base,
  build: { outDir: 'dist', sourcemap: false },
});
