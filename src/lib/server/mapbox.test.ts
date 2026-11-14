import { describe, expect, it } from 'vitest';
import { mapboxStaticUrl, validCoordinates } from './mapbox';

describe('validCoordinates', () => {
  it('accepts finite in-range coordinates', () => {
    expect(validCoordinates(38.88, -77.1)).toBe(true);
    expect(validCoordinates(-90, 180)).toBe(true);
    expect(validCoordinates(90, -180)).toBe(true);
  });

  it('rejects out-of-range, non-finite, and non-number values', () => {
    expect(validCoordinates(91, 0)).toBe(false);
    expect(validCoordinates(-91, 0)).toBe(false);
    expect(validCoordinates(0, 181)).toBe(false);
    expect(validCoordinates(0, -181)).toBe(false);
    expect(validCoordinates(Number.NaN, 0)).toBe(false);
    expect(validCoordinates(0, Number.POSITIVE_INFINITY)).toBe(false);
    expect(validCoordinates('38.88', '-77.1')).toBe(false);
    expect(validCoordinates(null, undefined)).toBe(false);
  });
});

describe('mapboxStaticUrl', () => {
  it('builds a Static Images URL with a pin and encoded token', () => {
    const url = mapboxStaticUrl('pk.test/token', 38.88, -77.1);
    expect(url).toBe(
      'https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/' +
        'pin-s(-77.1,38.88)/-77.1,38.88,15,0/640x280@2x' +
        '?access_token=pk.test%2Ftoken'
    );
  });

  it('honours a valid zoom', () => {
    expect(mapboxStaticUrl('token', 38.88, -77.1, 12)).toContain(
      '/-77.1,38.88,12,0/640x280@2x'
    );
  });

  it('returns null for a missing token', () => {
    expect(mapboxStaticUrl('', 38.88, -77.1)).toBeNull();
    expect(mapboxStaticUrl('   ', 38.88, -77.1)).toBeNull();
    expect(mapboxStaticUrl(undefined, 38.88, -77.1)).toBeNull();
    expect(mapboxStaticUrl(null, 38.88, -77.1)).toBeNull();
  });

  it('returns null for invalid coordinates or zoom', () => {
    expect(mapboxStaticUrl('token', 91, 0)).toBeNull();
    expect(mapboxStaticUrl('token', 0, 181)).toBeNull();
    expect(mapboxStaticUrl('token', Number.NaN, 0)).toBeNull();
    expect(mapboxStaticUrl('token', 38.88, -77.1, 0)).toBeNull();
    expect(mapboxStaticUrl('token', 38.88, -77.1, 21)).toBeNull();
    expect(mapboxStaticUrl('token', 38.88, -77.1, Number.NaN)).toBeNull();
  });
});
