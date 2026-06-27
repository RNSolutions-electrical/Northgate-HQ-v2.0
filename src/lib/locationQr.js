import { createQrSvg } from './qrCode.js';

const viteEnv = import.meta.env ?? {};
const APP_ORIGIN_OVERRIDE = viteEnv.VITE_APP_ORIGIN ?? viteEnv.VITE_APP_URL ?? '';
const LOCATION_UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const LOCATION_SCAN_ROUTE = new RegExp(`^/scan/location/(${LOCATION_UUID_PATTERN})/?$`, 'i');
const LOCATION_UUID_ONLY = new RegExp(`^${LOCATION_UUID_PATTERN}$`, 'i');

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

export function buildLocationScanPath(locationId) {
  if (!locationId) return '';
  return `/scan/location/${encodeURIComponent(locationId)}`;
}

export function parseLocationScanPayload(payload, origin = getAppOrigin()) {
  const rawPayload = String(payload ?? '').trim();
  if (!rawPayload) {
    return { ok: false, error: 'Scan payload is empty.' };
  }

  if (LOCATION_UUID_ONLY.test(rawPayload)) {
    return {
      ok: true,
      entityType: 'location',
      locationId: rawPayload.toLowerCase(),
      path: buildLocationScanPath(rawPayload.toLowerCase()),
    };
  }

  let pathname = rawPayload;

  try {
    pathname = new URL(rawPayload, origin).pathname;
  } catch {
    pathname = rawPayload.split(/[?#]/, 1)[0];
  }

  const match = pathname.match(LOCATION_SCAN_ROUTE);
  if (!match) {
    return {
      ok: false,
      error: 'Only Northgate HQ location QR payloads are supported.',
    };
  }

  return {
    ok: true,
    entityType: 'location',
    locationId: match[1].toLowerCase(),
    path: buildLocationScanPath(match[1].toLowerCase()),
  };
}
