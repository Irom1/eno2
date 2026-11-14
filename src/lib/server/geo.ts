/**
 * Server-only geographic helpers for "near me" location searches.
 *
 * Geocoding uses OpenStreetMap Nominatim, which needs no API key. Requests set
 * a descriptive User-Agent, are spaced at least one second apart, and are
 * cached in memory for an hour (including misses) to stay within Nominatim's
 * usage policy.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
  label?: string;
}

const EARTH_RADIUS_MILES = 3958.8;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Eno2/1.0 (https://github.com/Irom1/eno2)';
const CACHE_TTL_MS = 60 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1000;
const REQUEST_TIMEOUT_MS = 4000;

interface CacheEntry {
  at: number;
  points: GeoPoint[];
}

const cache = new Map<string, CacheEntry>();
let nextRequestAt = 0;
const CANDIDATE_LIMIT = 5;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const finiteCoordinate = (
  latValue: unknown,
  lngValue: unknown
): { lat: number; lng: number } | null => {
  const lat =
    typeof latValue === 'number'
      ? latValue
      : typeof latValue === 'string' && latValue.trim()
        ? Number(latValue)
        : Number.NaN;
  const lng =
    typeof lngValue === 'number'
      ? lngValue
      : typeof lngValue === 'string' && lngValue.trim()
        ? Number(lngValue)
        : Number.NaN;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return { lat, lng };
};

/** Great-circle distance between two points in miles. */
export function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const clamped = Math.min(1, Math.max(0, h));
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(clamped));
}

/** Parse a Nominatim jsonv2 response into every valid point, in ranked order. */
export function parseNominatimAll(body: unknown): GeoPoint[] {
  if (!Array.isArray(body)) return [];
  const points: GeoPoint[] = [];
  for (const value of body) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const coords = finiteCoordinate(row.lat, row.lon);
    if (!coords) continue;
    const label =
      typeof row.display_name === 'string' && row.display_name.trim()
        ? row.display_name.trim()
        : undefined;
    points.push(label ? { ...coords, label } : coords);
  }
  return points;
}

/** Parse a Nominatim jsonv2 response into the first valid point. */
export function parseNominatim(body: unknown): GeoPoint | null {
  return parseNominatimAll(body)[0] ?? null;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pick the candidate closest to any of the supplied points. Used to disambiguate
 * bare place names ("Arlington") toward locations where the dataset actually
 * has facilities, instead of blindly trusting Nominatim's global ranking.
 */
export function chooseNearestCandidate(
  candidates: GeoPoint[],
  near: GeoPoint[],
): GeoPoint | null {
  if (candidates.length === 0) return null;
  if (near.length === 0) return candidates[0] ?? null;
  let best = candidates[0] ?? null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = Math.min(...near.map((point) => haversineMiles(candidate, point)));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

async function geocodeCandidates(trimmed: string): Promise<GeoPoint[]> {
  const key = trimmed.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.points;

  const waitMs = nextRequestAt - Date.now();
  if (waitMs > 0) await sleep(waitMs);
  nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;

  const url = `${NOMINATIM_URL}?format=jsonv2&limit=${CANDIDATE_LIMIT}&q=${encodeURIComponent(trimmed)}`;
  let points: GeoPoint[] = [];
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        accept: 'application/json',
        'user-agent': USER_AGENT
      }
    });
    if (response.ok) {
      points = parseNominatimAll(await response.json());
    }
  } catch {
    points = [];
  }

  cache.set(key, { at: Date.now(), points });
  return points;
}

/**
 * Geocode a free-form place string via Nominatim. Never throws: returns null
 * when the query is empty, the service is unavailable, or nothing matches.
 *
 * When `near` is supplied, an ambiguous name is resolved to the candidate
 * closest to those points (e.g. Arlington, VA rather than Arlington, TX when
 * the surrounding data is in the DC metro area).
 */
export async function geocodePlace(
  query: string,
  options: { near?: GeoPoint[] } = {},
): Promise<GeoPoint | null> {
  const trimmed = typeof query === 'string' ? query.trim() : '';
  if (!trimmed) return null;

  const points = await geocodeCandidates(trimmed);
  if (points.length === 0) return null;
  return chooseNearestCandidate(points, options.near ?? []);
}
