import { describe, expect, it, vi } from 'vitest';
import { addressSearchText } from '../address';
import { searchAddresses, verifyAddress } from './address';

const address = { street_number: '4600', street_name: 'Silver Hill Road', city: 'Washington', state: 'DC', zip: '20233' };
const match = (overrides = {}) => ({ matchedAddress: '4600 SILVER HILL RD, WASHINGTON, DC, 20233', addressComponents: { city: 'WASHINGTON', state: 'DC', zip: '20233' }, ...overrides });
const census = (matches: unknown[]) => vi.fn(async (_url: RequestInfo | URL) => Response.json({ result: { addressMatches: matches } }));

describe('address matching', () => {
  it('only searches address-shaped chat text', () => {
    expect(addressSearchText('What is a checking account?')).toBe('');
    expect(addressSearchText('Ada Lovelace')).toBe('');
    expect(addressSearchText('My mailing address is 4600 Silver Hill')).toBe('4600 Silver Hill');
  });
  it('offers only complete US house addresses, without duplicate or city-only results', async () => {
    const properties = { countrycode: 'US', housenumber: '4600', street: 'Silver Hill Road', city: 'Washington', state: 'District of Columbia', postcode: '20233', osm_id: 42 };
    const transport = vi.fn(async () => Response.json({ features: [properties, properties, { ...properties, housenumber: '' }, { ...properties, countrycode: 'CA' }, { ...properties, street: 'Broad Branch Road' }, { ...properties, housenumber: '3001' }].map((properties) => ({ properties })) }));
    const results = await searchAddresses('4600 Silver Hill', { state: 'DC' }, transport);
    expect(results).toHaveLength(1);
    expect(results[0].address).toEqual(address);
    expect(transport).toHaveBeenCalledOnce();
  });
  it('accepts standard street abbreviations and preserves apartment and ZIP+4', async () => {
    const transport = census([match()]);
    const result = await verifyAddress({ ...address, street_name: 'Silver Hill Road, Apt 2', zip: '20233-1234' }, transport);
    expect(result.status).toBe('matched');
    expect(result.address?.street_name).toBe('SILVER HILL RD, Apt 2');
    expect(result.address?.zip).toBe('20233-1234');
    const url = new URL(String(transport.mock.calls[0]?.[0]));
    expect(url.searchParams.get('street')).toBe('4600 Silver Hill Road');
  });
  it('requires confirmation of changed cities or ZIPs instead of silently accepting them', async () => {
    const result = await verifyAddress({ ...address, city: 'Suitland', zip: '20746' }, census([match()]));
    expect(result.status).toBe('correction');
    expect(result.candidates?.[0].address.city).toBe('WASHINGTON');
  });
  it('rejects an unmatched address and never substitutes another house number', async () => {
    expect((await verifyAddress(address, census([]))).status).toBe('not_found');
    expect((await verifyAddress(address, census([match({ matchedAddress: '4602 SILVER HILL RD, WASHINGTON, DC, 20233' })]))).status).toBe('not_found');
  });
  it('fails closed when the address provider fails', async () => {
    await expect(verifyAddress(address, vi.fn(async () => new Response('', { status: 503 })))).rejects.toThrow('unavailable');
  });
});
