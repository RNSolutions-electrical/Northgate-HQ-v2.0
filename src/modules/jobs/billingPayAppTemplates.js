/** User-facing framework choices. Actual owner forms are attached as documents,
 * not embedded into the application, so Northgate can support AIA, GMP,
 * residential, commercial, and customer-specific requirements safely. */
export const PAY_APP_TEMPLATE_OPTIONS = Object.freeze([
  { key: 'aia_g702_g703', label: 'AIA G702 / G703', description: 'Standard AIA-style pay application; attach the licensed company form before export.' },
  { key: 'gmp', label: 'GMP Pay Application', description: 'Guaranteed maximum price billing format.' },
  { key: 'residential', label: 'Residential Progress Billing', description: 'Residential milestone/progress billing format.' },
  { key: 'commercial', label: 'Commercial Progress Billing', description: 'Commercial progress billing format.' },
  { key: 'custom', label: 'Custom Uploaded Form', description: 'Use a job-owned Pay Apps document uploaded by an authorized user.' },
]);

export function getPayAppTemplate(key) {
  return PAY_APP_TEMPLATE_OPTIONS.find((template) => template.key === key) ?? PAY_APP_TEMPLATE_OPTIONS[0];
}
