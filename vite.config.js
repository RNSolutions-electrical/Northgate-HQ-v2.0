import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function resolveBuildSha() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'git-unavailable';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_BUILD_SHA__: JSON.stringify(resolveBuildSha()),
  },
});
