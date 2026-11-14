/**
 * Client-safe OpenStreetMap URL builders for ATM map previews.
 *
 * The public OSM embed and map pages need no API key or SDK, so these helpers
 * can be imported from Svelte components without leaking a token.
 */

const EMBED_BASE = 'https://www.openstreetmap.org/export/embed.html';
const PAGE_BASE = 'https://www.openstreetmap.org/';

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
 * Build the canonical OpenStreetMap page URL for one coordinate.
 * Returns null for invalid coordinates.
 */
export function osmPageUrl(lat: number, lng: number): string | null {
  if (!validCoordinates(lat, lng)) return null;
  return `${PAGE_BASE}?mlat=${encodeURIComponent(String(lat))}&mlon=${encodeURIComponent(
    String(lng)
  )}#map=16/${lat}/${lng}`;
}
