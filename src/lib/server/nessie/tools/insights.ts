/**
 * Deterministic insight tools. All arithmetic happens here in TypeScript so
 * every dollar the model narrates can be traced to a tested calculation.
 * No LLM calls, no writes.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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
    const median = computeMedian(group.map((tx) => tx.amount));
    const mad = computeMedian(group.map((tx) => Math.abs(tx.amount - median)));
    // Require a substantial spike; ordinary variation and steady bills stay clear.
    const threshold = Math.max(median * 4, median + 6 * mad, median + 100);
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
        "Detect duplicate charges (same description+amount within 3 days) and amount outliers (above median + 3x MAD over the trailing 90 days).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { accountId: idParam },
    },
    async ({ accountId }) => {
      const asOf = todayUTC();
      const transactions = await fetchTransactions(client, accountId);
      const withdrawals = transactions.filter((tx) => tx.kind === "withdrawal");
      const duplicates = detectDuplicateCharges(withdrawals);
      const outliers = detectOutliers(withdrawals, asOf);
      const findings = [...duplicates, ...outliers];
      return ok({ count: findings.length, findings });
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
    server.registerTool(
      name,
      {
        description: `Find ${label} matching a city, zip, or name (case-insensitive). Returns up to 20 results.`,
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

        const matched = rows
          .filter((row) => {
            if (kind === "atm") {
              // ATMs have no address in the Nessie API; match on name only.
              return String(row.name ?? "").toLowerCase().includes(needle);
            }
            const address = rec(row.address);
            const street = [address.street_number, address.street_name]
              .filter(Boolean)
              .join(" ");
            const haystack = [
              row.name,
              address.city,
              address.state,
              address.zip,
              street,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            return haystack.includes(needle);
          })
          .slice(0, 20)
          .map((row) => {
            const geocode = rec(row.geocode);
            if (kind === "atm") {
              return {
                _id: row._id,
                name: truncateText(row.name, 160),
                hours: row.hours,
                accessibility: row.accessibility,
                amount_left: row.amount_left,
                language_list: row.language_list,
                lat: geocode.lat,
                lng: geocode.lng,
                note: "ATM records have no street address; matched by name only",
              };
            }
            const address = rec(row.address);
            return {
              _id: row._id,
              name: truncateText(row.name, 160),
              phone_number: row.phone_number,
              hours: row.hours,
              notes: row.notes,
              address: {
                street: [address.street_number, address.street_name]
                  .filter(Boolean)
                  .join(" ")
                  .trim(),
                city: address.city,
                state: address.state,
                zip: address.zip,
              },
              lat: geocode.lat,
              lng: geocode.lng,
            };
          });

        if (matched.length === 0) {
          return ok({ count: 0, message: `No ${label} found matching "${location}".` });
        }
        return ok({ count: matched.length, results: matched });
      },
    );
  };

  registerLocationTool("find_nearby_atms", "/atms", "ATMs", "atm");
  registerLocationTool("find_nearby_branches", "/branches", "branches", "branch");
}

export const INSIGHT_TOOL_NAMES = [
  "insight_financial_overview",
  "insight_spending_breakdown",
  "insight_upcoming_bills",
  "insight_recurring_charges",
  "insight_anomalies",
  "insight_goal_projection",
  "find_nearby_atms",
  "find_nearby_branches",
] as const;
