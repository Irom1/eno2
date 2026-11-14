import { describe, expect, it } from 'vitest';
import { appleMapsUrl, googleMapsUrl, osmEmbedUrl, validCoordinates } from './osm';

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

describe('osmEmbedUrl', () => {
  it('builds a bbox, layer and marker in west,south,east,north order', () => {
    const url = osmEmbedUrl(38.88, -77.1);
    expect(url).not.toBeNull();
    expect(url).toMatch(/^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?/);

    const query = new URL(url as string).searchParams;
    expect(query.get('bbox')).toBe('-77.108,38.8752,-77.092,38.8848');
    expect(query.get('layer')).toBe('mapnik');
    expect(query.get('marker')).toBe('38.88,-77.1');

    const bbox = (query.get('bbox') as string).split(',').map(Number);
    expect(bbox[0]).toBeLessThan(bbox[2]);
    expect(bbox[1]).toBeLessThan(bbox[3]);
  });

  it('respects a custom delta', () => {
    const query = new URL(osmEmbedUrl(10, 20, 0.01) as string).searchParams;
    expect(query.get('bbox')).toBe('19.99,9.994,20.01,10.006');
  });

  it('returns null for invalid coordinates or delta', () => {
    expect(osmEmbedUrl(91, 0)).toBeNull();
    expect(osmEmbedUrl(0, 181)).toBeNull();
    expect(osmEmbedUrl(Number.NaN, 0)).toBeNull();
    expect(osmEmbedUrl(10, 20, 0)).toBeNull();
    expect(osmEmbedUrl(10, 20, Number.NaN)).toBeNull();
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
