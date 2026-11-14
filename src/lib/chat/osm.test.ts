import { describe, expect, it } from 'vitest';
import { osmEmbedUrl, osmPageUrl, validCoordinates } from './osm';

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

describe('osmPageUrl', () => {
  it('builds a marker URL with a zoomed map fragment', () => {
    expect(osmPageUrl(42.3656347, -71.1040018)).toBe(
      'https://www.openstreetmap.org/?mlat=42.3656347&mlon=-71.1040018#map=16/42.3656347/-71.1040018'
    );
  });

  it('returns null for invalid coordinates', () => {
    expect(osmPageUrl(91, 0)).toBeNull();
    expect(osmPageUrl(0, Number.NaN)).toBeNull();
  });
});
