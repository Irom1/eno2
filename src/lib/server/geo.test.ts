import { describe, expect, it } from 'vitest';
import { chooseNearestCandidate, haversineMiles, parseNominatim, parseNominatimAll } from './geo';

describe('haversineMiles', () => {
  it('returns zero for identical points', () => {
    expect(
      haversineMiles({ lat: 42.3656347, lng: -71.1040018 }, { lat: 42.3656347, lng: -71.1040018 })
    ).toBe(0);
  });

  it('matches a known Boston to New York distance', () => {
    const miles = haversineMiles(
      { lat: 42.3601, lng: -71.0589 },
      { lat: 40.7128, lng: -74.006 }
    );
    expect(miles).toBeGreaterThan(185);
    expect(miles).toBeLessThan(195);
  });

  it('is symmetric and scales with latitude/longitude deltas', () => {
    const a = { lat: 38.8816, lng: -77.091 };
    const b = { lat: 42.3656347, lng: -71.1040018 };
    expect(haversineMiles(a, b)).toBeCloseTo(haversineMiles(b, a), 9);
    expect(haversineMiles(a, b)).toBeGreaterThan(300);
  });
});

describe('parseNominatim', () => {
  it('parses the first valid row and keeps the label', () => {
    const point = parseNominatim([
      {
        lat: '42.3656347',
        lon: '-71.1040018',
        display_name: 'Cambridge, Middlesex County, Massachusetts, United States'
      }
    ]);
    expect(point).toEqual({
      lat: 42.3656347,
      lng: -71.1040018,
      label: 'Cambridge, Middlesex County, Massachusetts, United States'
    });
  });

  it('accepts numeric coordinates and omits an empty label', () => {
    expect(parseNominatim([{ lat: 38.88, lon: -77.1, display_name: '  ' }])).toEqual({
      lat: 38.88,
      lng: -77.1
    });
  });

  it('skips malformed rows and empty responses', () => {
    expect(parseNominatim([])).toBeNull();
    expect(parseNominatim(null)).toBeNull();
    expect(parseNominatim({ lat: '1', lon: '2' })).toBeNull();
    expect(parseNominatim([{ lat: 'x', lon: '2' }])).toBeNull();
    expect(parseNominatim([{ lat: 91, lon: 0 }])).toBeNull();
    expect(parseNominatim([null, 'x', { lat: 10, lon: 20 }])).toEqual({ lat: 10, lng: 20 });
  });
});

describe('parseNominatimAll', () => {
  it('returns every valid row in ranked order', () => {
    expect(
      parseNominatimAll([
        { lat: '32.7355816', lon: '-97.1071186', display_name: 'Arlington, Texas' },
        { lat: '38.8816', lon: '-77.091', display_name: 'Arlington, Virginia' },
        { lat: 'x', lon: '0' }
      ])
    ).toEqual([
      { lat: 32.7355816, lng: -97.1071186, label: 'Arlington, Texas' },
      { lat: 38.8816, lng: -77.091, label: 'Arlington, Virginia' }
    ]);
  });
});

describe('chooseNearestCandidate', () => {
  const arlingtonTX = { lat: 32.7355816, lng: -97.1071186, label: 'Arlington, Texas' };
  const arlingtonVA = { lat: 38.8816, lng: -77.091, label: 'Arlington, Virginia' };
  const cambridgeUK = { lat: 52.1975846, lng: 0.1391537, label: 'Cambridge, UK' };
  const cambridgeMA = { lat: 42.3656347, lng: -71.1040018, label: 'Cambridge, MA' };
  const dataset = [{ lat: 38.8981779, lng: -77.1211338 }];

  it('prefers the candidate closest to the dataset', () => {
    expect(chooseNearestCandidate([arlingtonTX, arlingtonVA], dataset)).toBe(arlingtonVA);
    expect(chooseNearestCandidate([cambridgeUK, cambridgeMA], dataset)).toBe(cambridgeMA);
  });

  it('keeps Nominatim ranking when no bias points are supplied', () => {
    expect(chooseNearestCandidate([arlingtonTX, arlingtonVA], [])).toBe(arlingtonTX);
  });

  it('returns null for an empty candidate list', () => {
    expect(chooseNearestCandidate([], dataset)).toBeNull();
  });
});
