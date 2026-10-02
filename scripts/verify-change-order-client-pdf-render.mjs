import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(process.argv[2] || '.temp/change-order-client-pdf');
await mkdir(output, { recursive: true });

process.env.VITE_SUPABASE_URL ??= 'https://example.invalid';
process.env.VITE_SUPABASE_ANON_KEY ??= 'verification-only';
process.env.VITE_CLERK_PUBLISHABLE_KEY ??= 'pk_test_verification_only';

const server = await createServer({ configFile: false, cacheDir: resolve(output, 'vite-cache'), server: { middlewareMode: true } });
let browser;
try {
  const { clientChangeOrderHtml } = await server.ssrLoadModule('/src/modules/jobs/ChangeOrderWorkspace.jsx');
  const lines = Array.from({ length: 8 }, (_, index) => ({
    description: `Electrical scope ${index + 1}: conduit, wire and devices`,
    material_amount: 1200,
    labor_amount: 800,
    client_breakdown: {
      rows: Array.from({ length: 4 }, (_, detailIndex) => ({
        description: `${detailIndex + 1}. Furnish and install ${index + 1} electrical materials and associated labor. This longer explanation tests line wrapping in the client-facing document.`,
        quantity: detailIndex === 0 ? 2 : null,
        unit: detailIndex === 0 ? 'EA' : '',
        unit_price: detailIndex === 0 ? 75 : null,
        amount: null,
      })),
      show_remaining: true,
      remaining_label: 'Remaining scope balance',
    },
  }));
  const html = clientChangeOrderHtml({
    order: { co_number: 'CO-012', revision_number: 0 },
    job: { job_number: '26-100', name: 'Example Project', address_line1: '123 Main Street', city: 'Raleigh', state: 'NC', postal_code: '27601' },
    form: { title: 'Additional Electrical Work', description: 'Furnish and install additional electrical systems as described below.', change_order_date: '2026-10-02' },
    lines,
    overallMarkupAmount: 2400,
    total: 18400,
    logoUrl: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22310%22 height=%2276%22%3E%3Ctext x=%220%22 y=%2250%22 font-size=%2228%22%3ENORTHGATE%3C/text%3E%3C/svg%3E',
  });
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.pdf({ path: resolve(output, 'change-order-client-qa.pdf'), format: 'Letter', printBackground: true });
  await page.screenshot({ path: resolve(output, 'change-order-client-qa-screen.png'), fullPage: true });
  console.log(`Client PDF render complete: ${output}`);
} finally {
  if (browser) await browser.close();
  await server.close();
}
