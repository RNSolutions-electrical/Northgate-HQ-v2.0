import { createQrSvg } from './qrCode.js';

const APP_ORIGIN_OVERRIDE = import.meta.env.VITE_APP_ORIGIN ?? import.meta.env.VITE_APP_URL ?? '';

export function getAppOrigin() {
  const configuredOrigin = APP_ORIGIN_OVERRIDE.trim().replace(/\/+$/, '');
  if (configuredOrigin) return configuredOrigin;

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return 'https://rnsolutions.net';
}

export function buildLocationQrUrl(locationId, origin = getAppOrigin()) {
  if (!locationId) return '';
  return `${origin.replace(/\/+$/, '')}/scan/location/${encodeURIComponent(locationId)}`;
}

export function buildLocationQrSvg(locationId, origin = getAppOrigin()) {
  return createQrSvg(buildLocationQrUrl(locationId, origin));
}
