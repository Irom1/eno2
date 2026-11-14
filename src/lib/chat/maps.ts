/**
 * Client-safe external map URL builders and coordinate validation for ATM cards.
 *
 * The Apple/Google Maps links need no API key or SDK, so these helpers can be
 * imported from Svelte components. The Mapbox preview itself is fetched through
 * the server-side `/api/mapbox/static` proxy, so no token ever reaches here.
 */

const APPLE_MAPS_BASE = 'https://maps.apple.com/';
const GOOGLE_MAPS_BASE = 'https://www.google.com/maps/search/';

/** True when lat/lng are finite and inside the WGS84 bounds. */
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

/**
 * Build an Apple Maps URL centred on one coordinate with an optional label.
 * Returns null for invalid coordinates.
 */
export function appleMapsUrl(lat: number, lng: number, label?: string): string | null {
  if (!validCoordinates(lat, lng)) return null;
  const query = label && label.trim() ? label : 'ATM';
  return `${APPLE_MAPS_BASE}?ll=${lat},${lng}&q=${encodeURIComponent(query)}&z=16`;
}

/**
 * Build a Google Maps search URL for one coordinate with an optional label.
 * Returns null for invalid coordinates.
 */
export function googleMapsUrl(lat: number, lng: number, label?: string): string | null {
  if (!validCoordinates(lat, lng)) return null;
  const trimmed = label && label.trim() ? `${label} ` : '';
  return `${GOOGLE_MAPS_BASE}?api=1&query=${encodeURIComponent(`${trimmed}${lat},${lng}`)}`;
}
