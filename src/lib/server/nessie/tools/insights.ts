/**
 * Deterministic insight tools. All arithmetic happens here in TypeScript so
 * every dollar the model narrates can be traced to a tested calculation.
 * No LLM calls, no writes.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { geocodePlace, haversineMiles } from "../../geo";
import { maskAccountNumber, type NessieClient } from "../client";
import {
  daysBetween,
  normalizeText,
  parseDateUTC,
  safeJson,
  toMoney,
  truncateText,
} from "../format";
import { READ_ONLY_ANNOTATIONS } from "./raw";

type AnyRecord = Record<string, unknown>;

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCATION_RADIUS_MILES = 25;
const idParam = z.string().min(1).describe("Opaque id; do not assume format");
const ok = (summary: unknown) => ({
  content: [{ type: "text" as const, text: safeJson(summary) }],
});

const rec = (value: unknown): AnyRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};
const list = (value: unknown): AnyRecord[] => (Array.isArray(value) ? (value as AnyRecord[]) : []);
const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const finiteNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const round1 = (value: number): number => Math.round(value * 10) / 10;

export const todayUTC = (now: Date = new Date()): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export const monthStartUTC = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

export const addMonthsUTC = (date: Date, months: number): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

export const monthKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

export const toISODate = (date: Date): string => date.toISOString().slice(0, 10);

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: Date;
  kind: "deposit" | "withdrawal";
}

/** Convert a raw Nessie deposit/withdrawal into a normalized transaction. */
export function toTransaction(value: unknown, kind: "deposit" | "withdrawal"): Transaction | null {
  const raw = rec(value);
  if (['pending', 'cancelled', 'canceled', 'failed'].includes(String(raw.status ?? '').toLowerCase())) return null;
  const date = parseDateUTC(raw.transaction_date);
  if (Number.isNaN(date.getTime())) return null;
  return {
    id: String(raw._id ?? ""),
    description: String(raw.description ?? ""),
    amount: Math.abs(num(raw.amount)),
    date,
    kind,
  };
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

const CATEGORY_KEYWORDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  [
    "housing",
    ["RENT", "MORTGAGE", "LANDLORD", "APARTMENT", "HOA", "PROPERTY MGMT"],
  ],
  [
    "groceries",
    [
      "WHOLE FOODS",
      "TRADER JOE",
      "SAFEWAY",
      "KROGER",
      "COSTCO",
      "STAR MARKET",
      "GROCERY",
      "SUPERMARKET",
      "FARMERS MARKET",
    ],
  ],
  [
    "dining",
    [
      "RESTAURANT",
      "CAFE",
      "COFFEE",
      "STARBUCKS",
      "DUNKIN",
      "PIZZA",
      "TACO",
      "CHIPOTLE",
      "MCDONALD",
      "BAKERY",
      "DELI",
      "BAR",
      "GRILL",
      "KITCHEN",
      "BISTRO",
    ],
  ],
  [
    "transport",
    [
      "UBER",
      "LYFT",
      "MBTA",
      "TRANSIT",
      "METRO",
      "PARKING",
      "TOLL",
      "AIRLINE",
      "DELTA",
      "UNITED",
      "GAS STATION",
      "SHELL",
      "CHEVRON",
      "EXXON",
    ],
  ],
  [
    "utilities",
    ["ELECTRIC", "INTERNET", "COMCAST", "VERIZON", "T MOBILE", "AT T", "WATER", "UTILITY"],
  ],
  [
    "subscriptions",
    [
      "NETFLIX",
      "SPOTIFY",
      "HULU",
      "DISNEY",
      "YOUTUBE",
      "APPLE",
      "SUBSCRIPTION",
      "ADOBE",
      "CHATGPT",
      "PRIME",
    ],
  ],
  [
    "insurance",
    ["INSURANCE", "GEICO", "STATE FARM", "ALLSTATE", "PROGRESSIVE"],
  ],
  ["fitness", ["GYM", "FITNESS", "PELOTON", "YOGA", "PLANET", "CROSSFIT"]],
  [
    "shopping",
    ["AMAZON", "TARGET", "WALMART", "BEST BUY", "EBAY", "ETSY", "STORE", "SHOP", "NIKE", "ZARA"],
  ],
];

export const SPENDING_CATEGORIES = [
  "groceries",
  "dining",
  "transport",
  "utilities",
  "subscriptions",
  "insurance",
  "fitness",
  "housing",
  "shopping",
  "other",
] as const;

const CATEGORY_ALIASES: Record<string, string> = {
  grocery: "groceries",
  groceries: "groceries",
  supermarket: "groceries",
  rent: "housing",
  mortgage: "housing",
  restaurant: "dining",
  restaurants: "dining",
  food: "dining",
  transportation: "transport",
  transit: "transport",
  gas: "transport",
  utility: "utilities",
  subscription: "subscriptions",
  subscriptions: "subscriptions",
  shopping: "shopping",
  fitness: "fitness",
  gym: "fitness",
};

export function normalizeSpendingCategory(value: unknown): string {
  const key = String(value ?? "").trim().toLowerCase();
  if (!key) return "";
  if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key];
  return (SPENDING_CATEGORIES as readonly string[]).includes(key) ? key : key;
}

export function categorizeDescription(description: unknown): string {
  const normalized = normalizeText(description);
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return category;
  }
  return "other";
}

export function computeSavingsRate(inflow: number, outflow: number, decimals = 2): number {
  if (!Number.isFinite(inflow) || inflow <= 0) return 0;
  const rate = (inflow - outflow) / inflow;
  const factor = 10 ** decimals;
  return Math.round(rate * factor) / factor;
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

export function computeMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * One-sentence synopsis of the unusual-activity pattern counts, shared by the
 * tool payload and deterministic narration.
 */
export function summarizeAnomalyPatterns(duplicateCount: number, outlierCount: number): string {
  const parts: string[] = [];
  if (outlierCount === 1) parts.push("an unusually large purchase");
  else if (outlierCount > 1) parts.push("several unusually large purchases");
  if (duplicateCount === 1) parts.push("a possible duplicate");
  else if (duplicateCount > 1) parts.push("several possible duplicates");
  if (parts.length === 0) return "Nothing unusual stood out.";
  if (parts.length === 1) return `There is ${parts[0]}.`;
  return `There are ${parts[0]} and ${parts[1]}.`;
}

/** Shared by detection and demo seeding so smaller examples remain detectable. */
export function merchantOutlierBaseline(amounts: readonly number[]) {
  const median = computeMedian(amounts);
  const mad = computeMedian(amounts.map((amount) => Math.abs(amount - median)));
  return { median, mad, threshold: Math.max(median * 4, median + 6 * mad, median + 100) };
}

export interface DuplicateFinding {
  type: "duplicate";
  _id: string;
  description: string;
  amount: number;
  date: string;
  duplicateOf: string;
  reason: string;
}

/** Flag a later charge when the same description+amount recurs within N days. */
export function detectDuplicateCharges(
  transactions: readonly Transaction[],
  windowDays = 3,
): DuplicateFinding[] {
  const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());
  const flagged = new Set<number>();
  const findings: DuplicateFinding[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const first = sorted[i];
    if (!first) continue;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const later = sorted[j];
      if (!later) continue;
      const gap = daysBetween(first.date, later.date);
      if (gap > windowDays) break;
      if (flagged.has(j)) continue;
      if (normalizeText(first.description) !== normalizeText(later.description)) continue;
      if (toMoney(first.amount) !== toMoney(later.amount)) continue;
      if (gap < 0) continue;
      flagged.add(j);
      findings.push({
        type: "duplicate",
        _id: later.id,
        description: truncateText(later.description, 160),
        amount: toMoney(later.amount),
        date: toISODate(later.date),
        duplicateOf: toISODate(first.date),
        reason: `same description and amount within ${windowDays} days`,
      });
      break;
    }
  }

  return findings;
}

export interface OutlierFinding {
  type: "outlier";
  _id: string;
  description: string;
  amount: number;
  date: string;
  reason: string;
  median: number;
  mad: number;
  threshold: number;
}

/** Flags overall outliers and oversized purchases at familiar merchants (needs >= 8 txs). */
export function detectOutliers(
  transactions: readonly Transaction[],
  asOf: Date,
  windowDays = 90,
): OutlierFinding[] {
  // Recurring descriptions skip the overall baseline. They still receive a
  // merchant-specific check, so a familiar merchant cannot hide a large spike.
  const monthsByDescription = new Map<string, Set<string>>();
  for (const tx of transactions) {
    const key = normalizeText(tx.description);
    const months = monthsByDescription.get(key) ?? new Set<string>();
    months.add(monthKey(tx.date));
    monthsByDescription.set(key, months);
  }
  const recurringDescriptions = new Set(
    [...monthsByDescription.entries()]
      .filter(([, months]) => months.size >= 2)
      .map(([description]) => description),
  );

  const recentWindow = transactions.filter((tx) => {
    const age = daysBetween(tx.date, asOf);
    return age >= 0 && age <= windowDays;
  });
  if (recentWindow.length < 8) return [];

  const recent = recentWindow.filter(
    (tx) => !recurringDescriptions.has(normalizeText(tx.description)),
  );
  const findings = new Map<Transaction, OutlierFinding>();
  function addFinding(tx: Transaction, median: number, mad: number, threshold: number, reason: string) {
    if (findings.has(tx)) return;
    findings.set(tx, {
      type: "outlier",
      _id: tx.id,
      description: truncateText(tx.description, 160),
      amount: toMoney(tx.amount),
      date: toISODate(tx.date),
      reason,
      median: toMoney(median),
      mad: toMoney(mad),
      threshold: toMoney(threshold),
    });
  }
  if (recent.length) {
    const amounts = recent.map((tx) => tx.amount);
    const median = computeMedian(amounts);
    const mad = computeMedian(amounts.map((amount) => Math.abs(amount - median)));
    const threshold = median + 3 * mad;
    if (mad > 0) for (const tx of recent) {
      if (tx.amount > threshold) addFinding(tx, median, mad, threshold, "amount exceeds median + 3x MAD");
    }
  }
  const merchants = new Map<string, Transaction[]>();
  for (const tx of recentWindow) {
    const key = normalizeText(tx.description);
    const group = merchants.get(key) ?? [];
    group.push(tx);
    merchants.set(key, group);
  }
  for (const group of merchants.values()) {
    if (group.length < 3) continue;
    // Require a substantial spike; ordinary variation and steady bills stay clear.
    const { median, mad, threshold } = merchantOutlierBaseline(group.map((tx) => tx.amount));
    for (const tx of group) {
      if (tx.amount > threshold) addFinding(tx, median, mad, threshold, "much larger than this merchant's usual purchases");
    }
  }
  return recentWindow.flatMap((tx) => findings.has(tx) ? [findings.get(tx)!] : []);
}

export interface UpcomingBill {
  billId: string;
  payee: string;
  nickname: string;
  amount: number;
  dueDate: string;
  daysUntil: number;
  status: string;
  accountId: string;
}

/** Filter bills to the inclusive [asOf, asOf + days] window, sorted ascending. */
export function filterUpcomingBills(
  bills: readonly unknown[],
  asOf: Date,
  days: number,
): UpcomingBill[] {
  const results: UpcomingBill[] = [];
  for (const value of bills) {
    const bill = rec(value);
    const status = String(bill.status ?? "").toLowerCase();
    if (status === "cancelled" || status === "completed") continue;
    const due = parseDateUTC(bill.upcoming_payment_date);
    if (Number.isNaN(due.getTime())) continue;
    const daysUntil = daysBetween(asOf, due);
    if (!Number.isFinite(daysUntil) || daysUntil < 0 || daysUntil > days) continue;
    results.push({
      billId: String(bill._id ?? ""),
      payee: truncateText(bill.payee, 160),
      nickname: truncateText(bill.nickname, 160),
      amount: toMoney(num(bill.payment_amount)),
      dueDate: toISODate(due),
      daysUntil,
      status,
      accountId: String(bill.account_id ?? ""),
    });
  }
  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}

/* ------------------------------------------------------------------ */
/* Spending breakdown                                                  */
/* ------------------------------------------------------------------ */

export interface CategoryTotal {
  category: string;
  total: number;
  share: number;
}

export interface DescriptionTotal {
  description: string;
  total: number;
  count: number;
}

export interface LargestTransaction {
  description: string;
  amount: number;
  date: string;
}

export interface MonthlySpendingBreakdown {
  month: string;
  total: number;
  transactionCount: number;
  categories: CategoryTotal[];
}

export interface SpendingBreakdown {
  months: number;
  monthlyTotals: Array<{ month: string; total: number }>;
  monthlyBreakdown: MonthlySpendingBreakdown[];
  categories: CategoryTotal[];
  topDescriptions: DescriptionTotal[];
  largestTransactions: LargestTransaction[];
  monthOverMonth: {
    from: string;
    to: string;
    delta: number;
    pctChange: number;
  } | null;
  transactionCount: number;
  totalSpend: number;
  averageTransaction: number;
}

export function buildSpendingBreakdown(
  transactions: readonly Transaction[],
  months: number,
  asOf: Date,
): SpendingBreakdown {
  const currentMonth = monthStartUTC(asOf);
  const start = addMonthsUTC(currentMonth, -(months - 1));
  const end = addMonthsUTC(currentMonth, 1);

  const windowTx = transactions.filter(
    (tx) =>
      tx.kind === "withdrawal" &&
      tx.date.getTime() >= start.getTime() &&
      tx.date.getTime() < end.getTime(),
  );

  const totalSpend = toMoney(windowTx.reduce((sum, tx) => sum + tx.amount, 0));

  const byCategory = new Map<string, number>();
  for (const tx of windowTx) {
    const category = categorizeDescription(tx.description);
    byCategory.set(category, (byCategory.get(category) ?? 0) + tx.amount);
  }
  const categories: CategoryTotal[] = [...byCategory.entries()]
    .map(([category, total]) => ({
      category,
      total: toMoney(total),
      share: totalSpend > 0 ? toMoney(total / totalSpend) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const byDescription = new Map<string, { description: string; total: number; count: number }>();
  for (const tx of windowTx) {
    const key = normalizeText(tx.description);
    const existing = byDescription.get(key);
    if (existing) {
      existing.total += tx.amount;
      existing.count += 1;
    } else {
      byDescription.set(key, {
        description: truncateText(tx.description, 160),
        total: tx.amount,
        count: 1,
      });
    }
  }
  const topDescriptions: DescriptionTotal[] = [...byDescription.values()]
    .map((entry) => ({
      description: entry.description,
      total: toMoney(entry.total),
      count: entry.count,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const largestTransactions: LargestTransaction[] = [...windowTx]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((tx) => ({
      description: truncateText(tx.description, 160),
      amount: toMoney(tx.amount),
      date: toISODate(tx.date),
    }));

  const monthlyTotals: Array<{ month: string; total: number }> = [];
  const monthlyBreakdown: MonthlySpendingBreakdown[] = [];
  for (let i = 0; i < months; i += 1) {
    const bucketStart = addMonthsUTC(start, i);
    const key = monthKey(bucketStart);
    const monthTx = windowTx.filter((tx) => monthKey(tx.date) === key);
    const total = monthTx.reduce((sum, tx) => sum + tx.amount, 0);

    const monthByCategory = new Map<string, number>();
    for (const tx of monthTx) {
      const category = categorizeDescription(tx.description);
      monthByCategory.set(category, (monthByCategory.get(category) ?? 0) + tx.amount);
    }
    const monthCategories: CategoryTotal[] = [...monthByCategory.entries()]
      .map(([category, categoryTotal]) => ({
        category,
        total: toMoney(categoryTotal),
        share: total > 0 ? toMoney(categoryTotal / total) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    monthlyTotals.push({ month: key, total: toMoney(total) });
    monthlyBreakdown.push({
      month: key,
      total: toMoney(total),
      transactionCount: monthTx.length,
      categories: monthCategories,
    });
  }

  const currentKey = monthKey(currentMonth);
  const completeMonths = monthlyTotals.filter((bucket) => bucket.month < currentKey);
  let monthOverMonth: SpendingBreakdown["monthOverMonth"] = null;
  if (completeMonths.length >= 2) {
    const previous = completeMonths[completeMonths.length - 2];
    const latest = completeMonths[completeMonths.length - 1];
    if (previous && latest) {
      const delta = toMoney(latest.total - previous.total);
      monthOverMonth = {
        from: previous.month,
        to: latest.month,
        delta,
        pctChange:
          previous.total > 0 ? toMoney((delta / previous.total) * 100) : 0,
      };
    }
  }

  return {
    months,
    monthlyTotals,
    monthlyBreakdown,
    categories,
    topDescriptions,
    largestTransactions,
    monthOverMonth,
    transactionCount: windowTx.length,
    totalSpend,
    averageTransaction:
      windowTx.length > 0 ? toMoney(totalSpend / windowTx.length) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Top filtered transactions                                           */
/* ------------------------------------------------------------------ */

export interface TopTransactionRow {
  _id: string;
  description: string;
  amount: number;
  transactionDate: string;
}

export interface TopTransactionsResult {
  count: number;
  total: number;
  category: string | null;
  merchant: string | null;
  months: number;
  items: TopTransactionRow[];
}

export function buildTopTransactions(
  transactions: readonly Transaction[],
  options: { category?: string; merchant?: string; months: number; limit?: number; asOf: Date },
): TopTransactionsResult {
  const months = Math.max(1, Math.floor(options.months));
  const currentMonth = monthStartUTC(options.asOf);
  const start = addMonthsUTC(currentMonth, -(months - 1));
  const end = addMonthsUTC(currentMonth, 1);
  const category = options.category ? normalizeSpendingCategory(options.category) : "";
  const merchant = options.merchant ? normalizeText(options.merchant) : "";
  const matching = transactions
    .filter(
      (tx) =>
        tx.kind === "withdrawal" &&
        tx.date.getTime() >= start.getTime() &&
        tx.date.getTime() < end.getTime() &&
        (!category || categorizeDescription(tx.description) === category) &&
        (!merchant || normalizeText(tx.description).includes(merchant)),
    )
    .sort((a, b) => b.amount - a.amount || b.date.getTime() - a.date.getTime());
  const limit = Math.max(1, Math.min(50, Math.floor(options.limit ?? 20)));
  return {
    count: matching.length,
    total: toMoney(matching.reduce((sum, tx) => sum + tx.amount, 0)),
    category: category || null,
    merchant: options.merchant?.trim() || null,
    months,
    items: matching.slice(0, limit).map((tx) => ({
      _id: tx.id,
      description: truncateText(tx.description, 160),
      amount: toMoney(tx.amount),
      transactionDate: toISODate(tx.date),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Top merchants                                                       */
/* ------------------------------------------------------------------ */

export interface TopMerchantItem {
  _id: string;
  name: string;
  category: string;
  transactionCount: number;
  total: number;
}

export interface TopMerchantsResult {
  count: number;
  months: number;
  items: TopMerchantItem[];
}

/**
 * Group withdrawals by normalized merchant description and rank by how often
 * the customer visited, then by spend. `count` is the number of unique
 * merchants; `items` is the top `limit` rows for the merchant card.
 */
export function buildTopMerchants(
  transactions: readonly Transaction[],
  options: { months: number; limit?: number; asOf: Date },
): TopMerchantsResult {
  const months = Math.max(1, Math.floor(options.months));
  const currentMonth = monthStartUTC(options.asOf);
  const start = addMonthsUTC(currentMonth, -(months - 1));
  const end = addMonthsUTC(currentMonth, 1);

  const groups = new Map<string, { description: string; transactionCount: number; total: number }>();
  for (const tx of transactions) {
    if (tx.kind !== "withdrawal") continue;
    if (tx.date.getTime() < start.getTime() || tx.date.getTime() >= end.getTime()) continue;
    const key = normalizeText(tx.description);
    if (!key) continue;
    const existing = groups.get(key);
    if (existing) {
      existing.transactionCount += 1;
      existing.total += tx.amount;
    } else {
      groups.set(key, {
        description: truncateText(tx.description, 160),
        transactionCount: 1,
        total: tx.amount,
      });
    }
  }

  const limit = Math.max(1, Math.min(50, Math.floor(options.limit ?? 5)));
  const ranked = [...groups.entries()]
    .map(([key, group]) => ({ key, ...group }))
    .sort(
      (a, b) =>
        b.transactionCount - a.transactionCount ||
        b.total - a.total ||
        a.description.localeCompare(b.description),
    );

  return {
    count: ranked.length,
    months,
    items: ranked.slice(0, limit).map((group) => ({
      _id: `merchant:${group.key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`,
      name: group.description,
      category: categorizeDescription(group.description),
      transactionCount: group.transactionCount,
      total: toMoney(group.total),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Recurring charges                                                   */
/* ------------------------------------------------------------------ */

export interface RecurringCharge {
  description: string;
  monthsSeen: number;
  occurrences: number;
  averageAmount: number;
  lastAmount: number;
  lastDate: string;
}

export function findRecurringCharges(
  transactions: readonly Transaction[],
  cap = 20,
): RecurringCharge[] {
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const key = normalizeText(tx.description);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(tx);
    else groups.set(key, [tx]);
  }

  const charges: RecurringCharge[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const median = computeMedian(group.map((tx) => tx.amount));
    const lower = median * 0.95;
    const upper = median * 1.05;
    const withinBand = group
      .filter((tx) => tx.amount >= lower && tx.amount <= upper)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    if (withinBand.length < 2) continue;

    const monthsSeen = new Set(withinBand.map((tx) => monthKey(tx.date))).size;
    if (monthsSeen < 2) continue;

    const averageAmount =
      withinBand.reduce((sum, tx) => sum + tx.amount, 0) / withinBand.length;
    const last = withinBand[withinBand.length - 1];
    if (!last) continue;

    charges.push({
      description: truncateText(last.description, 160),
      monthsSeen,
      occurrences: withinBand.length,
      averageAmount: toMoney(averageAmount),
      lastAmount: toMoney(last.amount),
      lastDate: toISODate(last.date),
    });
  }

  return charges.sort((a, b) => b.averageAmount - a.averageAmount).slice(0, cap);
}

/* ------------------------------------------------------------------ */
/* Goal projection                                                     */
/* ------------------------------------------------------------------ */

export interface GoalProjection {
  monthlyNet: number;
  monthsToTarget: number | null;
  projections: Array<{ months: number; projectedBalance: number }>;
  onTrack: boolean;
}

export function projectGoal(
  currentBalance: number,
  monthlyNet: number,
  targetAmount: number,
  horizonMonths = 12,
): GoalProjection {
  const remaining = targetAmount - currentBalance;
  let monthsToTarget: number | null = null;
  if (remaining <= 0) {
    monthsToTarget = 0;
  } else if (monthlyNet > 0) {
    monthsToTarget = Math.ceil(remaining / monthlyNet);
  }

  const projections = [3, 6, 12].map((months) => ({
    months,
    projectedBalance: toMoney(currentBalance + monthlyNet * months),
  }));

  return {
    monthlyNet: toMoney(monthlyNet),
    monthsToTarget,
    projections,
    onTrack: monthsToTarget !== null && monthsToTarget <= horizonMonths,
  };
}

/* ------------------------------------------------------------------ */
/* Data helpers                                                        */
/* ------------------------------------------------------------------ */

async function fetchTransactions(
  client: NessieClient,
  accountId: string,
): Promise<Transaction[]> {
  const base = `/accounts/${encodeURIComponent(accountId)}`;
  const [deposits, withdrawals] = await Promise.all([
    client.get<unknown>(`${base}/deposits`),
    client.get<unknown>(`${base}/withdrawals`),
  ]);
  const result: Transaction[] = [];
  for (const value of list(deposits)) {
    const tx = toTransaction(value, "deposit");
    if (tx) result.push(tx);
  }
  for (const value of list(withdrawals)) {
    const tx = toTransaction(value, "withdrawal");
    if (tx) result.push(tx);
  }
  return result;
}

async function fetchCustomerAccounts(
  client: NessieClient,
  customerId: string,
): Promise<AnyRecord[]> {
  return list(
    await client.get(`/customers/${encodeURIComponent(customerId)}/accounts`),
  );
}

const accountBalance = (account: AnyRecord): number => num(account.balance);
const accountType = (account: AnyRecord): string =>
  String(account.type ?? "").toLowerCase();

/* ------------------------------------------------------------------ */
/* Tool registration                                                   */
/* ------------------------------------------------------------------ */

export function registerInsightTools(server: McpServer, client: NessieClient): void {
  server.registerTool(
    "insight_financial_overview",
    {
      description:
        "Deterministic financial snapshot for a customer: account balances (masked), liquid total, card balances, rewards, trailing 90-day inflow/outflow/net for checking+savings, savings rate, 3 monthly cashflow buckets, upcoming bills, and loan obligations.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { customerId: idParam },
    },
    async ({ customerId }) => {
      const asOf = todayUTC();
      const accounts = await fetchCustomerAccounts(client, customerId);

      const liquidAccounts = accounts.filter((account) => {
        const type = accountType(account);
        return type === "checking" || type === "savings";
      });
      const cardAccounts = accounts.filter((account) => accountType(account) === "credit card");

      const liquidTotal = toMoney(
        liquidAccounts.reduce((sum, account) => sum + accountBalance(account), 0),
      );
      const cardBalances = toMoney(
        cardAccounts.reduce((sum, account) => sum + accountBalance(account), 0),
      );
      const totalRewards = accounts.reduce(
        (sum, account) => sum + num(account.rewards),
        0,
      );

      const liquidTransactions = (
        await Promise.all(
          liquidAccounts.map((account) => fetchTransactions(client, String(account._id ?? ""))),
        )
      ).flat();

      const cutoff = new Date(asOf.getTime() - 90 * DAY_MS);
      const recent = liquidTransactions.filter(
        (tx) => tx.date.getTime() >= cutoff.getTime(),
      );
      const inflow = toMoney(
        recent
          .filter((tx) => tx.kind === "deposit")
          .reduce((sum, tx) => sum + tx.amount, 0),
      );
      const outflow = toMoney(
        recent
          .filter((tx) => tx.kind === "withdrawal")
          .reduce((sum, tx) => sum + tx.amount, 0),
      );
      const net = toMoney(inflow - outflow);
      const savingsRate = computeSavingsRate(inflow, outflow);

      const monthlyCashflow: Array<{
        month: string;
        inflow: number;
        outflow: number;
        net: number;
      }> = [];
      for (let offset = 2; offset >= 0; offset -= 1) {
        const bucket = addMonthsUTC(monthStartUTC(asOf), -offset);
        const key = monthKey(bucket);
        const monthTx = recent.filter((tx) => monthKey(tx.date) === key);
        const monthIn = monthTx
          .filter((tx) => tx.kind === "deposit")
          .reduce((sum, tx) => sum + tx.amount, 0);
        const monthOut = monthTx
          .filter((tx) => tx.kind === "withdrawal")
          .reduce((sum, tx) => sum + tx.amount, 0);
        monthlyCashflow.push({
          month: key,
          inflow: toMoney(monthIn),
          outflow: toMoney(monthOut),
          net: toMoney(monthIn - monthOut),
        });
      }

      const bills = list(await client.get(`/customers/${encodeURIComponent(customerId)}/bills`));
      const upcomingBills = bills.filter((bill) => {
        const status = String(bill.status ?? "").toLowerCase();
        if (status === "cancelled" || status === "completed") return false;
        const due = parseDateUTC(bill.upcoming_payment_date);
        if (Number.isNaN(due.getTime())) return false;
        return daysBetween(asOf, due) >= 0;
      });
      const upcomingBillsTotal = toMoney(
        upcomingBills.reduce((sum, bill) => sum + num(bill.payment_amount), 0),
      );

      const loanLists = await Promise.all(
        accounts.map((account) =>
          client.get(`/accounts/${encodeURIComponent(String(account._id ?? ""))}/loans`),
        ),
      );
      const loans = loanLists.flatMap((value) => list(value));
      const monthlyLoanPayment = toMoney(
        loans.reduce((sum, loan) => sum + num(loan.monthly_payment), 0),
      );

      return ok({
        asOf: asOf.toISOString(),
        accounts: accounts.map((account) => ({
          _id: account._id,
          type: account.type,
          nickname: account.nickname,
          balance: toMoney(accountBalance(account)),
          rewards: num(account.rewards),
          accountNumber: maskAccountNumber(account.account_number),
        })),
        liquidTotal,
        cardBalances,
        totalRewards,
        cashflow90Days: { inflow, outflow, net },
        savingsRate,
        monthlyCashflow,
        upcomingBills: { total: upcomingBillsTotal, count: upcomingBills.length },
        loanObligations: { monthlyPayment: monthlyLoanPayment, count: loans.length },
      });
    },
  );

  server.registerTool(
    "insight_spending_breakdown",
    {
      description:
        "Deterministic spending breakdown for an account over the last N calendar months: keyword-based categories, monthly totals, top descriptions, largest transactions, and month-over-month delta. Categories are estimated.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        accountId: idParam,
        months: z
          .number()
          .int()
          .min(1)
          .max(12)
          .optional()
          .describe("Number of calendar months to include (default 3)"),
      },
    },
    async ({ accountId, months }) => {
      const windowMonths = months ?? 3;
      const transactions = await fetchTransactions(client, accountId);
      const breakdown = buildSpendingBreakdown(transactions, windowMonths, todayUTC());
      return ok({
        ...breakdown,
        estimated: true,
        method: "keyword-categorization-v1",
      });
    },
  );

  server.registerTool(
    "insight_top_transactions",
    {
      description:
        "Top withdrawal transactions over the last N calendar months, optionally filtered by spending category and/or merchant description, sorted by amount descending. Returns the exact rows so a transaction list card can render.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        accountId: idParam,
        category: z.string().min(1).optional().describe("Spending category, e.g. groceries, dining, housing, transport"),
        merchant: z.string().min(1).optional().describe("Optional merchant or description substring"),
        months: z.number().int().min(1).max(12).optional().describe("Number of calendar months to include (default 3)"),
        limit: z.number().int().min(1).max(50).optional().describe("Maximum rows to return (default 20)"),
      },
    },
    async ({ accountId, category, merchant, months, limit }) => {
      const transactions = await fetchTransactions(client, accountId);
      return ok(buildTopTransactions(transactions, {
        category,
        merchant,
        months: months ?? 3,
        limit,
        asOf: todayUTC(),
      }));
    },
  );

  server.registerTool(
    "insight_top_merchants",
    {
      description:
        "Most frequent withdrawal merchants over the last N calendar months, grouped by description and sorted by transaction count then total spend. Returns one row per merchant so a single merchant card can render.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        accountId: idParam,
        months: z
          .number()
          .int()
          .min(1)
          .max(12)
          .optional()
          .describe("Number of calendar months to include (default 3)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum merchant rows to return (default 5)"),
      },
    },
    async ({ accountId, months, limit }) => {
      const transactions = await fetchTransactions(client, accountId);
      return ok(
        buildTopMerchants(transactions, {
          months: months ?? 3,
          limit,
          asOf: todayUTC(),
        }),
      );
    },
  );

  server.registerTool(
    "insight_upcoming_bills",
    {
      description:
        "Deterministic list of bills due in the next N days with liquid balance coverage, coverage ratio, and shortfall.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        customerId: idParam,
        days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe("Lookahead window in days (default 30)"),
      },
    },
    async ({ customerId, days }) => {
      const asOf = todayUTC();
      const windowDays = days ?? 30;
      const [bills, accounts] = await Promise.all([
        client.get(`/customers/${encodeURIComponent(customerId)}/bills`),
        fetchCustomerAccounts(client, customerId),
      ]);

      const upcoming = filterUpcomingBills(list(bills), asOf, windowDays);
      const total = toMoney(upcoming.reduce((sum, bill) => sum + bill.amount, 0));
      const liquidBalance = toMoney(
        accounts
          .filter((account) => {
            const type = accountType(account);
            return type === "checking" || type === "savings";
          })
          .reduce((sum, account) => sum + accountBalance(account), 0),
      );
      // Bill coverage is measured against checking, the account bills are paid
      // from. Savings is reported separately as liquid but not assumed spendable.
      const checkingBalance = toMoney(
        accounts
          .filter((account) => accountType(account) === "checking")
          .reduce((sum, account) => sum + accountBalance(account), 0),
      );
      const shortfall = toMoney(Math.max(0, total - checkingBalance));

      return ok({
        asOf: toISODate(asOf),
        days: windowDays,
        bills: upcoming,
        count: upcoming.length,
        total,
        liquidBalance,
        checkingBalance,
        coverageBasis: "checking",
        coverageRatio: total > 0 ? toMoney(checkingBalance / total) : null,
        shortfall,
        covered: shortfall === 0,
      });
    },
  );

  server.registerTool(
    "insight_recurring_charges",
    {
      description:
        "Detect likely recurring charges: same normalized description in at least two distinct months with amounts within 5% of the group median.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { accountId: idParam },
    },
    async ({ accountId }) => {
      const transactions = await fetchTransactions(client, accountId);
      const withdrawals = transactions.filter((tx) => tx.kind === "withdrawal");
      const charges = findRecurringCharges(withdrawals);
      return ok({ count: charges.length, recurringCharges: charges });
    },
  );

  server.registerTool(
    "insight_anomalies",
    {
      description:
        "Detect duplicate charges (same description+amount within 3 days) and amount outliers (above median + 3x MAD over the trailing 90 days). Pass customerId to scan all accounts (checking, savings, credit cards); pass accountId to scan one. Findings carry account ids/labels for card deep links.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        customerId: idParam.optional().describe("Customer id; scans every customer account when accountId is omitted"),
        accountId: idParam.optional().describe("Single account id to scan"),
      },
    },
    async ({ customerId, accountId }) => {
      const asOf = todayUTC();

      if (!customerId && !accountId) {
        return ok({
          count: 0,
          duplicateCount: 0,
          outlierCount: 0,
          summary: summarizeAnomalyPatterns(0, 0),
          findings: [],
          message: "Pass customerId to scan all accounts or accountId to scan one.",
        });
      }

      const targets: Array<{ id: string; label: string; type: string }> = [];
      if (accountId) {
        let account: AnyRecord | null = null;
        if (customerId) {
          const accounts = await fetchCustomerAccounts(client, customerId);
          account = accounts.find((entry) => String(entry._id ?? "") === accountId) ?? null;
        }
        if (!account) {
          try {
            account = rec(await client.get(`/accounts/${encodeURIComponent(accountId)}`));
          } catch {
            account = null;
          }
        }
        targets.push({
          id: accountId,
          label: account ? String(account.nickname ?? account.type ?? "").trim() : "",
          type: account ? accountType(account) : "",
        });
      } else if (customerId) {
        for (const account of await fetchCustomerAccounts(client, customerId)) {
          const id = String(account._id ?? "");
          if (!id) continue;
          targets.push({
            id,
            label: String(account.nickname ?? account.type ?? "").trim(),
            type: accountType(account),
          });
        }
      }

      // Detection stays per account: a checking charge and a card charge are not
      // duplicates of each other just because the description and amount match.
      const perAccount = await Promise.all(
        targets.map(async (target) => {
          try {
            const transactions = await fetchTransactions(client, target.id);
            const withdrawals = transactions.filter((tx) => tx.kind === "withdrawal");
            const duplicates = detectDuplicateCharges(withdrawals);
            const outliers = detectOutliers(withdrawals, asOf);
            const tag = (finding: DuplicateFinding | OutlierFinding) => ({
              ...finding,
              accountId: target.id,
              ...(target.label ? { accountLabel: target.label } : {}),
              ...(target.type ? { accountType: target.type } : {}),
            });
            return [...duplicates.map(tag), ...outliers.map(tag)];
          } catch {
            return [];
          }
        }),
      );

      const findings = perAccount.flat();
      const duplicateCount = findings.filter((finding) => finding.type === "duplicate").length;
      const outlierCount = findings.filter((finding) => finding.type === "outlier").length;
      return ok({
        count: findings.length,
        duplicateCount,
        outlierCount,
        summary: summarizeAnomalyPatterns(duplicateCount, outlierCount),
        findings,
      });
    },
  );

  server.registerTool(
    "insight_goal_projection",
    {
      description:
        "Project an account balance toward a target amount using net monthly cashflow from the last 3 complete months. Arithmetic only, no advice.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        accountId: idParam,
        targetAmount: z.number().positive().describe("Target balance in dollars"),
      },
    },
    async ({ accountId, targetAmount }) => {
      const [account, transactions] = await Promise.all([
        client.get(`/accounts/${encodeURIComponent(accountId)}`),
        fetchTransactions(client, accountId),
      ]);
      const asOf = todayUTC();
      const currentMonthStart = monthStartUTC(asOf);
      const completeMonths = [3, 2, 1].map((offset) =>
        addMonthsUTC(currentMonthStart, -offset),
      );
      const netByMonth = completeMonths.map((monthStart) => {
        const key = monthKey(monthStart);
        const monthTx = transactions.filter((tx) => monthKey(tx.date) === key);
        const inflow = monthTx
          .filter((tx) => tx.kind === "deposit")
          .reduce((sum, tx) => sum + tx.amount, 0);
        const outflow = monthTx
          .filter((tx) => tx.kind === "withdrawal")
          .reduce((sum, tx) => sum + tx.amount, 0);
        return inflow - outflow;
      });
      const monthlyNet =
        netByMonth.reduce((sum, value) => sum + value, 0) / netByMonth.length;
      const currentBalance = accountBalance(rec(account));
      const projection = projectGoal(currentBalance, monthlyNet, targetAmount);

      return ok({
        asOf: toISODate(asOf),
        accountId,
        currentBalance: toMoney(currentBalance),
        targetAmount: toMoney(targetAmount),
        monthlyNet: projection.monthlyNet,
        monthsInAverage: completeMonths.length,
        monthsToTarget: projection.monthsToTarget,
        projections: projection.projections,
        onTrack: projection.onTrack,
      });
    },
  );

  const registerLocationTool = (
    name: string,
    path: string,
    label: "ATMs" | "branches",
    kind: "atm" | "branch",
  ): void => {
    const coverageNote =
      kind === "atm"
        ? " Demo ATM data only covers Arlington, VA; the tool returns nearest available ATMs for other locations."
        : "";
    server.registerTool(
      name,
      {
        description: `Find ${label} matching a city, zip, or name (case-insensitive). Returns up to 20 results.${coverageNote}`,
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          location: z
            .string()
            .min(1)
            .describe("City, zip code, or institution name fragment"),
        },
      },
      async ({ location }) => {
        const needle = location.trim().toLowerCase();
        const rows = list(await client.get(path));

        interface NormalizedLocation {
          result: AnyRecord;
          searchText: string;
          lat: number | null;
          lng: number | null;
        }

        const normalized: NormalizedLocation[] = rows.map((row) => {
          const geocode = rec(row.geocode);
          const lat = finiteNumber(geocode.lat);
          const lng = finiteNumber(geocode.lng);
          if (kind === "atm") {
            return {
              result: {
                _id: row._id,
                name: truncateText(row.name, 160),
                hours: row.hours,
                accessibility: row.accessibility,
                amount_left: row.amount_left,
                language_list: row.language_list,
                lat: geocode.lat,
                lng: geocode.lng,
              },
              searchText: String(row.name ?? "").toLowerCase(),
              lat,
              lng,
            };
          }
          const address = rec(row.address);
          const street = [address.street_number, address.street_name]
            .filter(Boolean)
            .join(" ");
          const searchText = [
            row.name,
            address.city,
            address.state,
            address.zip,
            street,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return {
            result: {
              _id: row._id,
              name: truncateText(row.name, 160),
              phone_number: row.phone_number,
              hours: row.hours,
              notes: row.notes,
              address: {
                street,
                city: address.city,
                state: address.state,
                zip: address.zip,
              },
              lat: geocode.lat,
              lng: geocode.lng,
            },
            searchText,
            lat,
            lng,
          };
        });

        const geoRows = normalized.filter(
          (entry): entry is NormalizedLocation & { lat: number; lng: number } =>
            entry.lat !== null && entry.lng !== null,
        );
        const origin =
          geoRows.length > 0
            ? await geocodePlace(location, {
                near: geoRows.map((entry) => ({ lat: entry.lat, lng: entry.lng })),
              })
            : null;

        let matched: AnyRecord[];
        let resolvedLocation: { lat: number; lng: number; label: string | null } | null = null;
        let nearestMiles: number | null = null;
        if (origin) {
          // The search place resolved to real coordinates; expose the normalized
          // point so callers (and diagnostics) can see what was actually searched.
          resolvedLocation = {
            lat: origin.lat,
            lng: origin.lng,
            label: origin.label ?? null,
          };
          // Primary path: straight-line distance from the geocoded place. Keep
          // a 25-mile radius when anything is that close; otherwise return the
          // nearest rows so a remote search still yields a useful answer.
          const scored = geoRows.map((entry) => ({
            ...entry.result,
            distanceMiles: round1(
              haversineMiles(origin, { lat: entry.lat, lng: entry.lng }),
            ),
          }));
          const withinRadius = scored.filter(
            (row) => num(row.distanceMiles) <= LOCATION_RADIUS_MILES,
          );
          const pool = withinRadius.length > 0 ? withinRadius : scored;
          matched = pool
            .sort((a, b) => num(a.distanceMiles) - num(b.distanceMiles))
            .slice(0, 20)
            .map((row) =>
              kind === "atm"
                ? {
                    ...row,
                    note: "ATM records have no street address; distances are straight-line from the geocoded search location",
                  }
                : row,
            );
          nearestMiles = matched.length > 0 ? num(matched[0]?.distanceMiles) : null;
        } else {
          // Fallback: name/address substring matching when geocoding is
          // unavailable or the rows carry no coordinates.
          matched = normalized
            .filter((entry) => entry.searchText.includes(needle))
            .slice(0, 20)
            .map((entry) =>
              kind === "atm"
                ? {
                    ...entry.result,
                    note: "ATM records have no street address; matched by name only",
                  }
                : entry.result,
            );
        }

        if (matched.length === 0) {
          return ok({
            count: 0,
            message: `No ${label} found matching "${location}".`,
            radiusMiles: LOCATION_RADIUS_MILES,
            ...(kind === "atm" ? { coverage: "Arlington, VA", demoCoverage: true } : {}),
          });
        }
        return ok({
          count: matched.length,
          results: matched,
          radiusMiles: LOCATION_RADIUS_MILES,
          nearestMiles,
          ...(resolvedLocation ? { resolvedLocation } : {}),
          ...(kind === "atm" ? { coverage: "Arlington, VA", demoCoverage: true } : {}),
        });
      },
    );
  };

  registerLocationTool("find_nearby_atms", "/atms", "ATMs", "atm");
  registerLocationTool("find_nearby_branches", "/branches", "branches", "branch");
}

export const INSIGHT_TOOL_NAMES = [
  "insight_financial_overview",
  "insight_spending_breakdown",
  "insight_top_transactions",
  "insight_top_merchants",
  "insight_upcoming_bills",
  "insight_recurring_charges",
  "insight_anomalies",
  "insight_goal_projection",
  "find_nearby_atms",
  "find_nearby_branches",
] as const;
