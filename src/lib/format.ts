/** Small, dependency-free display formatters used by the dashboard. */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

export interface MoneyOptions {
  /** Force a fixed number of fraction digits. */
  decimals?: number;
  /** Prefix positive amounts with "+". */
  signed?: boolean;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** `$4,283.59` for cents, `$4,218` for whole amounts. */
export function money(value: unknown, options: MoneyOptions = {}): string {
  const amount = toNumber(value);
  const sign = options.signed && amount > 0 ? "+" : "";
  const formatted = Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: options.decimals ?? 0,
    maximumFractionDigits: options.decimals ?? 2
  });
  return `${amount < 0 ? "-" : sign}$${formatted}`;
}

/** Rounded whole dollars: `$4,218`. */
export function moneyWhole(value: unknown): string {
  return money(Math.round(toNumber(value)), { decimals: 0 });
}

/** `"2026-10"` -> `"Oct 2026"`. */
export function monthLabel(key: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  return `${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}

export function monthLabelLong(key: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  return `${MONTHS_LONG[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}

/** `"2026-12-05"` -> `"Dec 5"` (UTC-safe, no timezone shift). */
export function dateLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${MONTHS[Number(match[2]) - 1] ?? match[2]} ${Number(match[3])}`;
}

/** `17` -> `"in 17 days"`; `0` -> `"today"`. */
export function daysLabel(days: number): string {
  const rounded = Math.round(days);
  if (rounded === 0) return "today";
  if (rounded === 1) return "in 1 day";
  if (rounded === -1) return "1 day ago";
  if (rounded < 0) return `${Math.abs(rounded)} days ago`;
  return `in ${rounded} days`;
}

/** `"Maya Chen"` -> `"MC"`. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** `"credit card"` -> `"Credit Card"`. */
export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function percent(value: number, digits = 0): string {
  return `${(toNumber(value) * 100).toFixed(digits)}%`;
}
