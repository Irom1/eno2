/** Small deterministic formatting helpers shared by tools and tests. */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Round to two decimal places without float dust. */
export function toMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Parse a Nessie date into a UTC Date.
 * Plain `YYYY-MM-DD` values are interpreted as UTC midnight (no local drift).
 * Timestamps without a zone suffix are treated as UTC as well.
 */
export function parseDateUTC(iso: unknown): Date {
  const text = String(iso ?? "").trim();
  if (!text) return new Date(Number.NaN);

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(text);
  return new Date(hasZone ? text : `${text}Z`);
}

/** Whole calendar days between two dates, using UTC midnights. */
export function daysBetween(from: Date | string, to: Date | string): number {
  const start = from instanceof Date ? from : parseDateUTC(from);
  const end = to instanceof Date ? to : parseDateUTC(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Number.NaN;
  return Math.floor((end.getTime() - start.getTime()) / DAY_MS);
}

/** Uppercase, strip punctuation, and collapse whitespace. */
export function normalizeText(input: unknown): string {
  return String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ClampedRows<T> {
  count: number;
  truncated: boolean;
  rows: T[];
}

/** Cap a list while reporting how many rows existed in total. */
export function clampRows<T>(rows: readonly T[], max = 50): ClampedRows<T> {
  return {
    count: rows.length,
    truncated: rows.length > max,
    rows: rows.slice(0, max),
  };
}

/** JSON.stringify that never throws on cyclic or non-serializable input. */
export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return "{}";
  }
}

/** Shorten free text for tool payloads. */
export function truncateText(input: unknown, max = 160): string {
  const text = String(input ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}\u2026`;
}
