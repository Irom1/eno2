import { describe, expect, it } from 'vitest';
import {
  clampPercent,
  deltaDirection,
  relativeDateLabel,
  signedMoney,
  sparklinePoints
} from './primitives.js';

describe('clampPercent', () => {
  it('clamps into 0..100 by default', () => {
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(42.5)).toBe(42.5);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(-20)).toBe(0);
  });

  it('is finite-safe', () => {
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampPercent(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('honours a custom maximum', () => {
    expect(clampPercent(25, 10)).toBe(10);
    expect(clampPercent(-1, 10)).toBe(0);
    expect(clampPercent(5, 0)).toBe(0);
  });
});

describe('signedMoney', () => {
  it('prefixes positive and negative amounts', () => {
    expect(signedMoney(12.5)).toBe('+$12.50');
    expect(signedMoney(-12.5)).toBe('\u2212$12.50');
    expect(signedMoney(3, 0)).toBe('+$3');
    expect(signedMoney(-3, 0)).toBe('\u2212$3');
  });

  it('returns an unsigned zero', () => {
    expect(signedMoney(0)).toBe('$0.00');
    expect(signedMoney(0, 0)).toBe('$0');
  });

  it('is finite-safe', () => {
    expect(signedMoney(Number.NaN)).toBe('$0.00');
    expect(signedMoney(Number.POSITIVE_INFINITY)).toBe('$0.00');
  });
});

describe('relativeDateLabel', () => {
  const now = new Date('2026-12-05T12:00:00Z');

  it('labels today and nearby days', () => {
    expect(relativeDateLabel('2026-12-05', now)).toBe('today');
    expect(relativeDateLabel('2026-12-08', now)).toBe('in 3 days');
    expect(relativeDateLabel('2026-12-02', now)).toBe('3 days ago');
    expect(relativeDateLabel('2026-12-06', now)).toBe('in 1 day');
    expect(relativeDateLabel('2026-12-04', now)).toBe('1 day ago');
  });

  it('handles month and year boundaries', () => {
    expect(relativeDateLabel('2027-01-01', new Date('2026-12-30T12:00:00Z'))).toBe('in 2 days');
  });

  it('returns an empty string for invalid input', () => {
    expect(relativeDateLabel('')).toBe('');
    expect(relativeDateLabel('not-a-date')).toBe('');
    expect(relativeDateLabel('2026-02-31')).toBe('');
    expect(relativeDateLabel('2026-13-01')).toBe('');
  });
});

describe('deltaDirection', () => {
  it('classifies positive, negative, and zero deltas', () => {
    expect(deltaDirection(1)).toBe('up');
    expect(deltaDirection(-1)).toBe('down');
    expect(deltaDirection(0)).toBe('flat');
  });

  it('treats non-finite input as flat', () => {
    expect(deltaDirection(Number.NaN)).toBe('flat');
    expect(deltaDirection(Number.POSITIVE_INFINITY)).toBe('flat');
  });
});

describe('sparklinePoints', () => {
  it('returns an empty string for an empty series', () => {
    expect(sparklinePoints([])).toBe('');
  });

  it('scales a rising series across the padded box', () => {
    expect(sparklinePoints([1, 2, 3], 100, 28, 2)).toBe('2,26 50,14 98,2');
  });

  it('renders a flat series at the vertical middle', () => {
    expect(sparklinePoints([5, 5, 5], 100, 28, 2)).toBe('2,14 50,14 98,14');
  });

  it('renders a single value without dividing by zero', () => {
    expect(sparklinePoints([4], 100, 28, 2)).toBe('2,14');
  });

  it('drops non-finite values and never emits NaN', () => {
    const points = sparklinePoints([1, Number.NaN, 3]);
    expect(points).toBe('2,26 98,2');
    expect(points).not.toContain('NaN');
  });
});
