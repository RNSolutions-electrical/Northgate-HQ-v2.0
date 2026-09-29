// Isolated preview: Vite serves only local source and sample data. No app auth or Supabase client is mounted.
import { createServer } from 'vite';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const server = await createServer({
  configFile: false,
  base: '/',
  cacheDir: join(tmpdir(), `northgate-inventory-ui-preview-${randomUUID()}`),
  server: {
    host: '127.0.0.1',
    port: 5321,
    strictPort: true,
    headers: {
      'Content-Security-Policy': "connect-src 'self' ws://127.0.0.1:5321; form-action 'none'; object-src 'none'",
    },
  },
});
await server.listen();
console.log('Inventory UI preview: http://127.0.0.1:5321/tests/browser/inventory-ui-preview.html');
