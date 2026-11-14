/**
 * Client-safe map URL builders for ATM map previews and external map links.
 *
 * The public OSM embed and the Apple/Google Maps links need no API key or SDK,
 * so these helpers can be imported from Svelte components without leaking a
 * token.
 */

const EMBED_BASE = 'https://www.openstreetmap.org/export/embed.html';
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

function validDelta(delta: unknown): delta is number {
  return typeof delta === 'number' && Number.isFinite(delta) && delta > 0 && delta <= 45;
}

/**
 * Build an OpenStreetMap embed URL with a single marker.
 * Returns null for invalid coordinates or a non-positive delta.
 */
export function osmEmbedUrl(lat: number, lng: number, delta = 0.008): string | null {
  if (!validCoordinates(lat, lng) || !validDelta(delta)) return null;

  // 6 decimals is ~0.1 m and avoids binary float noise in the bbox.
  const round6 = (value: number): string => String(Math.round(value * 1e6) / 1e6);
  const south = lat - delta * 0.6;
  const north = lat + delta * 0.6;
  const west = lng - delta;
  const east = lng + delta;
  const bbox = `${round6(west)},${round6(south)},${round6(east)},${round6(north)}`;
  return `${EMBED_BASE}?bbox=${bbox}&layer=mapnik&marker=${round6(lat)},${round6(lng)}`;
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
