import { describe, expect, it } from 'vitest';
import { appleMapsUrl, googleMapsUrl, validCoordinates } from './maps';

describe('validCoordinates', () => {
  it('accepts finite in-range pairs', () => {
    expect(validCoordinates(0, 0)).toBe(true);
    expect(validCoordinates(42.3656347, -71.1040018)).toBe(true);
    expect(validCoordinates(-90, -180)).toBe(true);
    expect(validCoordinates(90, 180)).toBe(true);
  });

  it('rejects malformed or out-of-range pairs', () => {
    expect(validCoordinates(91, 0)).toBe(false);
    expect(validCoordinates(0, 181)).toBe(false);
    expect(validCoordinates(Number.NaN, 0)).toBe(false);
    expect(validCoordinates(0, Number.POSITIVE_INFINITY)).toBe(false);
    expect(validCoordinates('42', '-71')).toBe(false);
  });
});

describe('appleMapsUrl', () => {
  it('builds an Apple Maps URL with coordinates, label and zoom', () => {
    const url = appleMapsUrl(42.3656347, -71.1040018, 'Arlington ATM');
    expect(url).not.toBeNull();
    expect(url).toMatch(/^https:\/\/maps\.apple\.com\/\?/);

    const query = new URL(url as string).searchParams;
    expect(query.get('ll')).toBe('42.3656347,-71.1040018');
    expect(query.get('q')).toBe('Arlington ATM');
    expect(query.get('z')).toBe('16');
  });

  it('escapes reserved characters in the label', () => {
    const query = new URL(appleMapsUrl(1, 2, 'ATM & Bank / Main') as string).searchParams;
    expect(query.get('q')).toBe('ATM & Bank / Main');
    expect(appleMapsUrl(1, 2, 'ATM & Bank / Main')).toContain(
      `q=${encodeURIComponent('ATM & Bank / Main')}`
    );
  });

  it('falls back to an ATM label when none is provided', () => {
    const query = new URL(appleMapsUrl(10, 20) as string).searchParams;
    expect(query.get('q')).toBe('ATM');
  });

  it('returns null for invalid coordinates', () => {
    expect(appleMapsUrl(91, 0)).toBeNull();
    expect(appleMapsUrl(0, 181)).toBeNull();
    expect(appleMapsUrl(Number.NaN, 0)).toBeNull();
    expect(appleMapsUrl(0, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('googleMapsUrl', () => {
  it('builds a Google Maps search URL with label and coordinates', () => {
    const url = googleMapsUrl(42.3656347, -71.1040018, 'Arlington ATM');
    expect(url).not.toBeNull();
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?/);

    const query = new URL(url as string).searchParams;
    expect(query.get('api')).toBe('1');
    expect(query.get('query')).toBe('Arlington ATM 42.3656347,-71.1040018');
  });

  it('omits the label prefix when none is provided', () => {
    const query = new URL(googleMapsUrl(10, 20) as string).searchParams;
    expect(query.get('query')).toBe('10,20');
  });

  it('escapes reserved characters in the label', () => {
    const query = new URL(googleMapsUrl(1, 2, 'ATM & Bank / Main') as string).searchParams;
    expect(query.get('query')).toBe('ATM & Bank / Main 1,2');
    expect(googleMapsUrl(1, 2, 'ATM & Bank / Main')).toContain(
      `query=${encodeURIComponent('ATM & Bank / Main 1,2')}`
    );
  });

  it('returns null for invalid coordinates', () => {
    expect(googleMapsUrl(91, 0)).toBeNull();
    expect(googleMapsUrl(0, 181)).toBeNull();
    expect(googleMapsUrl(Number.NaN, 0)).toBeNull();
    expect(googleMapsUrl(0, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('map embed removal', () => {
  it('no longer exports an OpenStreetMap embed builder', async () => {
    const module = await import('./maps');
    expect('osmEmbedUrl' in module).toBe(false);
  });

  it('external links never point at an OSM embed', () => {
    expect(appleMapsUrl(1, 2)).not.toContain('openstreetmap');
    expect(googleMapsUrl(1, 2)).not.toContain('openstreetmap');
  });
});
