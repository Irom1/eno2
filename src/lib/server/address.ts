import { addressLabel, type AddressCandidate, type AddressCheck, type MailingAddress } from '../address';
import { customerCreateSchema, normalizeState } from '../signup';
import type { FetchLike } from './nessie/client';

type RecordValue = Record<string, unknown>;
const rec = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const cache = new Map<string, { expires: number; value: unknown }>();
function remember(key: string, value: unknown) { if (cache.size >= 200) cache.delete(cache.keys().next().value!); cache.set(key, { expires: Date.now() + 300_000, value }); }
function cached<T>(key: string): T | undefined { const item = cache.get(key); if (!item) return; if (item.expires <= Date.now()) { cache.delete(key); return; } return item.value as T; }

export async function searchAddresses(query: string, context: { city?: string; state?: string; zip?: string } = {}, fetchImpl: FetchLike = fetch): Promise<AddressCandidate[]> {
  const suffix = !query.includes(',') && !/\b\d{5}(?:-\d{4})?\b/.test(query)
    ? [context.city, context.state, context.zip].filter(Boolean).join(' ') : '';
  const fullQuery = [query, suffix].filter(Boolean).join(', ');
  const key = `search:${fullQuery.toLowerCase()}`;
  const existing = fetchImpl === fetch ? cached<AddressCandidate[]>(key) : undefined; if (existing) return existing;
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', fullQuery); url.searchParams.set('countrycode', 'US'); url.searchParams.set('limit', '12'); url.searchParams.set('lang', 'en');
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(7000), headers: { accept: 'application/json', 'user-agent': 'eno2-demo/0.1 (address suggestions)' } });
  if (!response.ok) throw new Error('Address suggestions are unavailable');
  const payload = rec(await response.json());
  const seen = new Set<string>();
  const suggestions: AddressCandidate[] = [];
  const typed = query.match(/^(\S+)\s+([^,\s]+)/);
  for (const item of Array.isArray(payload.features) ? payload.features : []) {
    const properties = rec(rec(item).properties);
    if (text(properties.countrycode).toUpperCase() !== 'US') continue;
    const parsed = customerCreateSchema.shape.address.safeParse({
      street_number: text(properties.housenumber), street_name: text(properties.street),
      city: text(properties.city || properties.town || properties.village || properties.municipality),
      state: normalizeState(text(properties.state)), zip: text(properties.postcode)
    });
    if (!parsed.success) continue;
    // Photon can return loosely related places. Never suggest a different
    // house number or a street unrelated to the name being typed.
    if (typed && (normalize(parsed.data.street_number) !== normalize(typed[1]) ||
      !normalizeStreet(parsed.data.street_name).startsWith(normalizeStreet(typed[2])))) continue;
    const label = addressLabel(parsed.data);
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    suggestions.push({ id: `osm-${text(properties.osm_type)}-${String(properties.osm_id ?? suggestions.length)}`, label, address: parsed.data });
    if (suggestions.length === 5) break;
  }
  if (fetchImpl === fetch) remember(key, suggestions);
  return suggestions;
}

const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
function normalizeStreet(value: string): string {
  const abbreviations: Record<string, string> = { STREET: 'ST', ROAD: 'RD', AVENUE: 'AVE', BOULEVARD: 'BLVD', DRIVE: 'DR', LANE: 'LN', COURT: 'CT', PLACE: 'PL', PARKWAY: 'PKWY', TERRACE: 'TER', HIGHWAY: 'HWY', NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W', NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW' };
  return normalize(value).split(' ').map((word) => abbreviations[word] ?? word).join(' ');
}

/** Census confirms a US street-address match, not occupancy or unit deliverability. */
export async function verifyAddress(input: MailingAddress, fetchImpl: FetchLike = fetch): Promise<AddressCheck> {
  const key = `verify:${JSON.stringify(input)}`;
  const existing = fetchImpl === fetch ? cached<AddressCheck>(key) : undefined; if (existing) return existing;
  const unitMatch = input.street_name.match(/(?:\s*,\s*|\s+)((?:(?:apt\.?|apartment|unit|suite|ste\.?)\s+|#\s*)\S.*)$/i);
  const unit = unitMatch?.[1] ?? '';
  const street = unitMatch ? input.street_name.slice(0, unitMatch.index).trim().replace(/,$/, '') : input.street_name;
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/address');
  for (const [name, value] of Object.entries({ street: `${input.street_number} ${street}`, city: input.city, state: input.state, zip: input.zip, benchmark: 'Public_AR_Current', format: 'json' })) url.searchParams.set(name, value);
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('Address check is unavailable');
  const result = rec(rec(await response.json()).result);
  const candidates: AddressCandidate[] = [];
  for (const [index, value] of (Array.isArray(result.addressMatches) ? result.addressMatches : []).entries()) {
    const match = rec(value); const components = rec(match.addressComponents);
    const parts = text(match.matchedAddress).split(',')[0]?.trim().match(/^(\S+)\s+(.+)$/);
    if (!parts || normalize(parts[1]) !== normalize(input.street_number)) continue;
    const zip = text(components.zip);
    const parsed = customerCreateSchema.shape.address.safeParse({ street_number: parts[1], street_name: parts[2] + (unit ? `, ${unit}` : ''), city: text(components.city), state: normalizeState(text(components.state)), zip: zip === input.zip.slice(0, 5) ? input.zip : zip });
    if (parsed.success) candidates.push({ id: `census-${index}`, label: addressLabel(parsed.data), address: parsed.data });
  }
  const exact = candidates.filter(({ address }) => normalizeStreet(unit ? address.street_name.slice(0, -(unit.length + 2)) : address.street_name) === normalizeStreet(street) && normalize(address.city) === normalize(input.city) && address.state === input.state && address.zip.slice(0, 5) === input.zip.slice(0, 5));
  let check: AddressCheck;
  if (exact.length === 1) check = { status: 'matched', message: 'Street address matched.', address: exact[0].address };
  else if (candidates.length) check = { status: 'correction', message: 'I found a close match. Is one of these your address?', candidates: candidates.slice(0, 5) };
  else check = { status: 'not_found', message: 'I couldn’t match that address. Could you check the street number, city, state, and ZIP, or pick a suggestion as you type?' };
  if (fetchImpl === fetch) remember(key, check);
  return check;
}

export class AddressValidationError extends Error {
  constructor(readonly check: AddressCheck) { super(check.message); }
}
