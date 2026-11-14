/**
 * Server-only Mapbox Static Images URL builder for ATM map previews.
 *
 * The access token stays on the server: callers pass it in, and the returned
 * URL is only used by the `/api/mapbox/static` proxy. Never import this module
 * from client code.
 */

const MAPBOX_STATIC_BASE =
  'https://api.mapbox.com/styles/v1/mapbox/streets-v12/static';

/**
 * True when lat/lng are finite and inside the WGS84 bounds.
 */
export function validCoordinates(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function validZoom(zoom: unknown): zoom is number {
  return typeof zoom === 'number' && Number.isFinite(zoom) && zoom >= 1 && zoom <= 20;
}

/**
 * Build a Mapbox Static Images URL with a single pin at the given coordinate.
 * Returns null when the token is missing or the coordinate/zoom is invalid.
 * Errors never include the token value.
 */
export function mapboxStaticUrl(
  token: string | null | undefined,
  lat: number,
  lng: number,
  zoom = 15
): string | null {
  const accessToken = typeof token === 'string' ? token.trim() : '';
  if (!accessToken) return null;
  if (!validCoordinates(lat, lng)) return null;
  if (!validZoom(zoom)) return null;

  return (
    `${MAPBOX_STATIC_BASE}/pin-s(${lng},${lat})/` +
    `${lng},${lat},${zoom},0/640x280@2x` +
    `?access_token=${encodeURIComponent(accessToken)}`
  );
}
