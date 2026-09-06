import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://fixture.invalid'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-fixture-only') },
  server: { host: '127.0.0.1', port: 5186, strictPort: true },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5186/northgate/tests/fixtures/permission-templates.html');
  await page.getByRole('button', { name: 'Create Template', exact: true }).click();
  await page.getByRole('textbox', { name: 'Template name', exact: true }).fill('Estimator');
  await page.getByRole('checkbox', { name: 'Estimate', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Create Jobs', exact: true }).check();
  assert.equal(await page.evaluate(() => window.testCalls.length), 0, 'Checkbox edits must stay local');
  assert.equal(await page.getByRole('alertdialog').count(), 0, 'No reason until Save');
  await page.getByRole('button', { name: 'Save Template', exact: true }).click();
  let dialog = page.getByRole('alertdialog');
  assert.equal(await dialog.getByRole('button', { name: 'Save Template', exact: true }).isDisabled(), true);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.getByRole('checkbox', { name: 'Estimate', exact: true }).isChecked(), true);
  assert.equal(await page.evaluate(() => window.testCalls.length), 0);
  await page.getByRole('button', { name: 'Save Template', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Reason' }).fill('Original estimator access template');
  await dialog.getByRole('button', { name: 'Save Template', exact: true }).click();
  await page.getByText('Template saved. Linked users now inherit these permissions.').waitFor();
  let calls = await page.evaluate(() => window.testCalls);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.p_permissions.can_estimate, true);
  assert.equal(calls[0].params.p_permissions.can_create_jobs, true);
  assert.equal(calls[0].params.p_reason, 'Original estimator access template');

  await page.getByRole('combobox', { name: 'User permission template', exact: true }).selectOption('template-2');
  await page.getByRole('button', { name: 'Open Permissions', exact: true }).click();
  await page.getByRole('radio', { name: 'Estimate deny', exact: true }).check();
  await page.getByRole('radio', { name: 'View Protected Project Financials grant', exact: true }).check();
  assert.equal(await page.evaluate(() => window.testCalls.length), 1);
  await page.getByRole('button', { name: 'Save User Permissions', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Reason' }).fill('Assign estimator with individual exceptions');
  await dialog.getByRole('button', { name: 'Save Permissions', exact: true }).click();
  await page.getByText('User template and overrides saved.').waitFor();
  calls = await page.evaluate(() => window.testCalls);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].params.p_overrides, { can_estimate: false, can_view_protected_project_financials: true });
  assert.equal(calls[1].params.p_template_id, 'template-2');

  await page.getByRole('textbox', { name: 'Template name', exact: true }).fill('Estimator revised');
  await page.evaluate(() => { window.failNextSave = true; });
  await page.getByRole('button', { name: 'Save Template', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Reason' }).fill('Stale edit test');
  await dialog.getByRole('button', { name: 'Save Template', exact: true }).click();
  await dialog.getByText('Template changed since you opened it. Reload before saving.').waitFor();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Template name', exact: true }).inputValue(), 'Estimator revised');

  await mkdir('.temp/permission-templates', { recursive: true });
  for (const [label, width, height] of [['desktop',1366,900],['tablet',768,1024],['mobile',390,844]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.getByRole('radio', { name: 'Create Jobs default', exact: true }).isVisible(), true, `${label} all permissions remain visible`);
    await page.screenshot({ path: `.temp/permission-templates/${label}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label} page overflow`);
  }
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: draft edits, save-time reason, cancel, template and override batches, failed-save recovery, desktop/tablet/mobile overflow.');
} finally {
  await browser?.close();
  await server.close();
}
