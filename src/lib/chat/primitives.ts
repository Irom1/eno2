/**
 * Pure, client-safe display helpers shared by inline card primitives.
 * Data only: no editorial copy, no DOM or server imports.
 */
import { dateLabel, daysLabel, money } from '../format.js';

/** Clamp a percentage-like number into `0..max`, treating non-finite input as zero. */
export function clampPercent(value: number, max = 100): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  const limit = typeof max === 'number' && Number.isFinite(max) ? Math.max(0, max) : 100;
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(limit, Math.max(0, numeric));
}

/** `+$12.50`, `−$12.50`, or `$0.00`; uses the shared `money` formatter. */
export function signedMoney(amount: unknown, decimals = 2): string {
  const numeric = typeof amount === 'number' ? amount : Number(amount);
  const value = Number.isFinite(numeric) ? numeric : 0;
  if (value > 0) return `+${money(value, { decimals })}`;
  if (value < 0) return `\u2212${money(Math.abs(value), { decimals })}`;
  return money(0, { decimals });
}

function isoDateParts(iso: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject impossible calendar dates such as 2026-02-31.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return [year, month, day];
}

/** `today`, `in N days`, `N days ago`, or the absolute short date for invalid input. */
export function relativeDateLabel(iso: string, now: Date = new Date()): string {
  if (typeof iso !== 'string') return '';
  const parts = isoDateParts(iso);
  if (!parts) return '';

  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(current.getTime())) return '';

  const target = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const start = Date.UTC(
    current.getFullYear(),
    current.getMonth(),
    current.getDate()
  );
  const diff = Math.round((target - start) / 86_400_000);
  if (!Number.isFinite(diff)) return dateLabel(iso);
  return daysLabel(diff);
}

/** Direction of a signed delta; non-finite input is treated as flat. */
export function deltaDirection(delta: number): 'up' | 'down' | 'flat' {
  const numeric = typeof delta === 'number' ? delta : Number(delta);
  if (!Number.isFinite(numeric) || numeric === 0) return 'flat';
  return numeric > 0 ? 'up' : 'down';
}

function point(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * SVG polyline points for a small series. Non-finite values are dropped, an
 * empty series returns `''`, and a flat series renders at the vertical middle.
 */
export function sparklinePoints(
  values: readonly number[],
  width = 100,
  height = 28,
  padding = 2
): string {
  const list = Array.isArray(values)
    ? values
        .map((value) => (typeof value === 'number' ? value : Number(value)))
        .filter((value) => Number.isFinite(value))
    : [];
  if (list.length === 0) return '';

  const w = Number.isFinite(width) && width > 0 ? width : 100;
  const h = Number.isFinite(height) && height > 0 ? height : 28;
  const pad = Number.isFinite(padding) && padding >= 0 ? Math.min(padding, w / 2, h / 2) : 2;

  const innerWidth = Math.max(0, w - pad * 2);
  const innerHeight = Math.max(0, h - pad * 2);
  const min = Math.min(...list);
  const max = Math.max(...list);
  const flat = min === max;

  return list
    .map((value, index) => {
      const x = list.length === 1 ? pad : pad + (innerWidth * index) / (list.length - 1);
      const y = flat
        ? h / 2
        : pad + innerHeight * (1 - (value - min) / (max - min));
      return `${point(x)},${point(y)}`;
    })
    .join(' ');
}
