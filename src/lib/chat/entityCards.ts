/**
 * Client-safe inline entity-card models and normalizers.
 * Pure functions only: no server or DOM imports.
 */
import { asItems, isRecord } from './payloads.js';
import type { ClimateReport } from '$lib/climate/emissions.js';

export interface TransactionCardPayload {
  description: string;
  amount: number | null;
  date: string;
  /** Set by anomaly inference only; present_card transactions have no flag. */
  flag?: 'duplicate' | 'unusual';
  duplicateOf?: string;
  comparisonScope?: 'merchant' | 'account';
  transactionId: string;
  accountId?: string;
  customerId?: string;
}

export interface TransactionEntityCard {
  id: number;
  entityId: string;
  kind: 'transaction';
  payload: TransactionCardPayload;
  afterText?: number;
}

export interface TransactionRow {
  id: string;
  description: string;
  amount: number | null;
  date: string;
  status?: string;
  accountId?: string;
  customerId?: string;
}

export interface TransactionListPayload {
  rows: TransactionRow[];
  more: number; // transactions not shown beyond the cap; uses payload.count when provided
}

export interface TransactionListEntityCard {
  id: number;
  entityId: string; // 'transaction-list': one list card per turn
  kind: 'transaction-list';
  payload: TransactionListPayload;
  afterText?: number;
}

export interface PieSlice {
  label: string;
  amount: number;
  share: number; // 0..1
}

export interface SpendingPiePayload {
  period: string; // e.g. "October 2026"
  total: number;
  slices: PieSlice[];
}

export interface SpendingPieEntityCard {
  id: number;
  entityId: string; // 'spending-pie'
  kind: 'spending-pie';
  payload: SpendingPiePayload;
  afterText?: number;
}

export interface BillCardPayload {
  billId: string;
  payee: string;
  amount: number | null;
  dueDate: string;
  status?: string;
  accountId?: string;
  customerId?: string;
}

export interface BillEntityCard {
  id: number;
  entityId: string;
  kind: 'bill';
  payload: BillCardPayload;
  afterText?: number;
}

export interface AccountCardPayload {
  accountId: string;
  nickname: string;
  type: string;
  maskedNumber: string;
  balance: number | null;
  rewards: number | null;
  customerId?: string;
}

export interface AccountEntityCard {
  id: number;
  entityId: string;
  kind: 'account';
  payload: AccountCardPayload;
  afterText?: number;
}

export interface LoanCardPayload {
  loanId: string;
  type: string;
  balance: number | null;
  monthlyPayment: number | null;
  status?: string;
  accountId?: string;
  customerId?: string;
}

export interface LoanEntityCard {
  id: number;
  entityId: string;
  kind: 'loan';
  payload: LoanCardPayload;
  afterText?: number;
}

export interface LocationCardPayload {
  locationId: string;
  name: string;
  address: string;
  hours?: string;
  /** ATM results are maps-first; branches carry a street address. */
  type?: 'atm' | 'branch';
  lat?: number;
  lng?: number;
  /** Straight-line miles from the geocoded search location, when known. */
  distanceMiles?: number;
  customerId?: string;
}

export interface LocationEntityCard {
  id: number;
  entityId: string;
  kind: 'location';
  payload: LocationCardPayload;
  afterText?: number;
}

export interface RecurringChargeCardPayload {
  chargeId: string;
  description: string;
  averageAmount: number | null;
  monthsSeen: number;
  lastDate: string;
  customerId?: string;
}

export interface RecurringChargeEntityCard {
  id: number;
  entityId: string;
  kind: 'recurring';
  payload: RecurringChargeCardPayload;
  afterText?: number;
}

export interface RewardCardPayload {
  rewardId: string;
  label: string; // account nickname or "Total rewards"
  points: number;
  accountId?: string;
  customerId?: string;
}

export interface RewardEntityCard {
  id: number;
  entityId: string;
  kind: 'reward';
  payload: RewardCardPayload;
  afterText?: number;
}

export interface GoalCardPayload {
  goalId: string;
  accountId?: string;
  target: number;
  current: number;
  monthsToTarget: number | null;
  projectedDate?: string; // ISO if monthsToTarget is finite
  customerId?: string;
}

export interface GoalEntityCard {
  id: number;
  entityId: string;
  kind: 'goal';
  payload: GoalCardPayload;
  afterText?: number;
}

export interface CashflowPointCardPayload {
  period: string; // e.g. "September 2026"
  inflow: number;
  outflow: number;
  net: number;
}

export interface CashflowPointEntityCard {
  id: number;
  entityId: string;
  kind: 'cashflow';
  payload: CashflowPointCardPayload;
  afterText?: number;
}

export interface MerchantCardPayload {
  merchantId: string;
  name: string;
  category?: string;
  address?: string;
  customerId?: string;
}

export interface MerchantEntityCard {
  id: number;
  entityId: string; // 'merchant:<id>'
  kind: 'merchant';
  payload: MerchantCardPayload;
  afterText?: number;
}

export interface ProfileCardPayload {
  customerId: string;
  name: string;
  location?: string; // "City, State" only
}

export interface ProfileEntityCard {
  id: number;
  entityId: string; // 'profile:<id>'
  kind: 'profile';
  payload: ProfileCardPayload;
  afterText?: number;
}

export interface ClimateWiseCardPayload {
  /** The full ClimateWise report from the insight tool. */
  report: ClimateReport;
  customerId?: string;
  /** Derived from the highest-kg category, for follow-up prompts. */
  topCategory?: string;
}

export interface ClimateWiseEntityCard {
  id: number;
  entityId: 'climatewise';
  kind: 'climatewise';
  payload: ClimateWiseCardPayload;
  afterText?: number;
}

export type EntityCard =
  | TransactionEntityCard
  | TransactionListEntityCard
  | SpendingPieEntityCard
  | BillEntityCard
  | AccountEntityCard
  | LoanEntityCard
  | LocationEntityCard
  | RecurringChargeEntityCard
  | RewardEntityCard
  | GoalEntityCard
  | CashflowPointEntityCard
  | MerchantEntityCard
  | ProfileEntityCard
  | ClimateWiseEntityCard;

export const TRANSACTION_LIST_ENTITY_ID = 'transaction-list';
export const SPENDING_PIE_ENTITY_ID = 'spending-pie';

/**
 * Deep link into the dashboard account activity view for one transaction.
 * Returns undefined unless every id is present so cards render without a link
 * rather than pointing at a broken target.
 */
export function transactionHref(
  customerId: string | undefined,
  accountId: string | undefined,
  transactionId: string | undefined
): string | undefined {
  const customer = typeof customerId === 'string' ? customerId.trim() : '';
  const account = typeof accountId === 'string' ? accountId.trim() : '';
  const transaction = typeof transactionId === 'string' ? transactionId.trim() : '';
  if (!customer || !account || !transaction) return undefined;
  return `/dashboard?customer=${encodeURIComponent(customer)}&account=${encodeURIComponent(account)}&txn=${encodeURIComponent(transaction)}`;
}

/**
 * Deep link into the dashboard account bills view for one bill. Returns
 * undefined unless every id is present so cards render without a link rather
 * than pointing at a broken target.
 */
export function billHref(
  customerId: string | undefined,
  accountId: string | undefined,
  billId: string | undefined
): string | undefined {
  const customer = typeof customerId === 'string' ? customerId.trim() : '';
  const account = typeof accountId === 'string' ? accountId.trim() : '';
  const bill = typeof billId === 'string' ? billId.trim() : '';
  if (!customer || !account || !bill) return undefined;
  return `/dashboard?customer=${encodeURIComponent(customer)}&account=${encodeURIComponent(account)}&tab=bills&bill=${encodeURIComponent(bill)}`;
}

/**
 * Deep link into the dashboard account view. Returns undefined unless both ids
 * are present so the card renders without a broken link.
 */
export function accountHref(
  customerId: string | undefined,
  accountId: string | undefined
): string | undefined {
  const customer = typeof customerId === 'string' ? customerId.trim() : '';
  const account = typeof accountId === 'string' ? accountId.trim() : '';
  if (!customer || !account) return undefined;
  return `/dashboard?customer=${encodeURIComponent(customer)}&account=${encodeURIComponent(account)}`;
}

function normalizeCap(cap: number): number {
  if (typeof cap !== 'number' || !Number.isFinite(cap)) return 2;
  return Math.max(0, Math.floor(cap));
}

function descriptionOf(value: unknown): string {
  if (typeof value !== 'string') return 'Recent charge';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'Recent charge';
}

function amountOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function dateOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function entityIdFor(type: string, payload: TransactionCardPayload): string {
  const amountKey = payload.amount === null ? 'null' : String(payload.amount);
  return `${type}|${payload.description}|${payload.date}|${amountKey}`;
}

export interface TransactionCardContext {
  accountId?: string;
  customerId?: string;
  cap?: number;
}

function contextStrings(context: TransactionCardContext | undefined): {
  accountId?: string;
  customerId?: string;
} {
  const result: { accountId?: string; customerId?: string } = {};
  if (context && typeof context.accountId === 'string' && context.accountId.trim().length > 0) {
    result.accountId = context.accountId;
  }
  if (context && typeof context.customerId === 'string' && context.customerId.trim().length > 0) {
    result.customerId = context.customerId;
  }
  return result;
}

/**
 * Normalize one transaction record into a primitive transaction card, used by
 * the server-side `present_card` pipeline. Returns null without a stable id so
 * the caller can reject the request.
 */
export function transactionCard(
  record: unknown,
  accountId: string | undefined,
  customerId: string | undefined,
  afterText: number,
  startId: number
): TransactionEntityCard | null {
  try {
    if (!isRecord(record)) return null;

    const rawId = record._id ?? record.id;
    const transactionId =
      (typeof rawId === 'string' || typeof rawId === 'number') &&
      String(rawId).trim().length > 0
        ? String(rawId).trim()
        : '';
    if (!transactionId) return null;

    const dateValue = record.transactionDate ?? record.transaction_date ?? record.date;
    const payloadOut: TransactionCardPayload = {
      description: descriptionOf(record.description),
      amount: amountOf(record.amount),
      date: dateOf(dateValue),
      transactionId,
      ...(optionalTrimmed(accountId) ? { accountId: optionalTrimmed(accountId) } : {}),
      ...(optionalTrimmed(customerId) ? { customerId: optionalTrimmed(customerId) } : {})
    };

    const card: TransactionEntityCard = {
      id: typeof startId === 'number' && Number.isFinite(startId) ? startId : 1,
      entityId: transactionId,
      kind: 'transaction',
      payload: payloadOut
    };
    if (typeof afterText === 'number' && Number.isFinite(afterText)) {
      card.afterText = afterText;
    }
    return card;
  } catch {
    return null;
  }
}

/**
 * Normalize insight_anomalies findings into single-transaction cards: one card
 * per finding. An explicit caller cap is honored, but the default never
 * silently drops findings from a suspicious-activity scan. Malformed
 * payloads and entries are skipped rather than thrown on.
 */
export function anomalyTransactionCards(
  payload: unknown,
  afterText: number,
  startId: number,
  context?: TransactionCardContext
): TransactionEntityCard[] {
  const limit = normalizeCap(context?.cap ?? Number.MAX_SAFE_INTEGER);
  if (limit === 0) return [];

  try {
    if (!isRecord(payload) || !Array.isArray(payload.findings)) return [];
    const findings = payload.findings;
    const contextIds = contextStrings(context);

    const cards: TransactionEntityCard[] = [];
    const seen = new Set<string>();

    for (let index = 0; index < findings.length; index += 1) {
      if (cards.length >= limit) break;
      const finding = findings[index];
      if (!isRecord(finding)) continue;

      const type = typeof finding.type === 'string' ? finding.type : '';
      const flag = type === 'duplicate' ? 'duplicate' : 'unusual';
      const description = descriptionOf(finding.description);
      const amount = amountOf(finding.amount);
      const date = dateOf(finding.date);
      const transactionId =
        typeof finding._id === 'string' || typeof finding._id === 'number'
          ? String(finding._id)
          : '';
      const findingAccountId =
        typeof finding.accountId === 'string' ? finding.accountId.trim() : '';
      const payload: TransactionCardPayload = {
        description,
        amount,
        date,
        flag,
        transactionId,
        ...contextIds,
        ...(findingAccountId ? { accountId: findingAccountId } : {})
      };

      if (typeof finding.duplicateOf === 'string') {
        payload.duplicateOf = finding.duplicateOf;
      }
      if (flag === 'unusual') payload.comparisonScope = typeof finding.reason === 'string' && /merchant/i.test(finding.reason) ? 'merchant' : 'account';

      const entityId = transactionId || entityIdFor(type || 'unusual', payload);

      if (seen.has(entityId)) continue;
      seen.add(entityId);

      cards.push({
        id: startId + cards.length,
        entityId,
        kind: 'transaction',
        payload,
        afterText
      });
    }

    return cards;
  } catch {
    return [];
  }
}

function normalizeListCap(cap: number): number {
  if (typeof cap !== 'number' || !Number.isFinite(cap)) return 8;
  return Math.max(0, Math.floor(cap));
}

function transactionRowOf(
  item: Record<string, unknown>,
  contextIds: { accountId?: string; customerId?: string }
): TransactionRow {
  const descriptionRaw = typeof item.description === 'string' ? item.description.trim() : '';
  const description = descriptionRaw || 'Transaction';
  const amount =
    typeof item.amount === 'number' && Number.isFinite(item.amount) ? item.amount : null;
  const transactionDate = item.transactionDate;
  const fallbackDate = item.date;
  const date =
    typeof transactionDate === 'string'
      ? transactionDate
      : typeof fallbackDate === 'string'
        ? fallbackDate
        : '';

  const explicitId = item._id ?? item.id;
  const id =
    (typeof explicitId === 'string' || typeof explicitId === 'number') &&
    String(explicitId).trim().length > 0
      ? String(explicitId).trim()
      : `${description}|${date}|${amount === null ? 'null' : String(amount)}`;

  const row: TransactionRow = { id, description, amount, date, ...contextIds };
  if (typeof item.status === 'string' && item.status.trim().length > 0) {
    row.status = item.status.trim();
  }
  return row;
}

function uniqueRows(rows: TransactionRow[]): TransactionRow[] {
  const seen = new Set<string>();
  const unique: TransactionRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    if (typeof row.id !== 'string' || seen.has(row.id)) continue;
    seen.add(row.id);
    unique.push(row);
  }
  return unique;
}

/**
 * Build one list card from a transactions tool payload, or null when empty.
 * Rows are whitelisted and deduped; only `cap` rows are visible.
 */
export function transactionListCard(
  payload: unknown,
  afterText: number,
  startId: number,
  context?: TransactionCardContext
): TransactionListEntityCard | null {
  try {
    const items = asItems(payload);
    if (items.length === 0) return null;

    const contextIds = contextStrings(context);
    const cap = context?.cap ?? 8;
    const rows = uniqueRows(items.map((item) => transactionRowOf(item, contextIds)));
    const visible = rows.slice(0, normalizeListCap(cap));
    if (visible.length === 0) return null;

    const declared =
      isRecord(payload) && typeof payload.count === 'number' && Number.isFinite(payload.count)
        ? Math.floor(payload.count)
        : null;
    const total = declared !== null ? Math.max(declared, rows.length) : rows.length;

    const card: TransactionListEntityCard = {
      id: typeof startId === 'number' && Number.isFinite(startId) ? startId : 1,
      entityId: TRANSACTION_LIST_ENTITY_ID,
      kind: 'transaction-list',
      payload: { rows: visible, more: Math.max(0, total - visible.length) }
    };
    if (typeof afterText === 'number' && Number.isFinite(afterText)) {
      card.afterText = afterText;
    }
    return card;
  } catch {
    return null;
  }
}

const MONTH_KEY = /^\d{4}-\d{2}$/;

function utcMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** `"2026-10"` -> `"October 2026"`; malformed keys are returned unchanged. */
export function spendingPiePeriod(month: string): string {
  if (!MONTH_KEY.test(month)) return month;
  const [year, monthIndex] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1, 1));
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(date);
  } catch {
    return month;
  }
}

interface CategoryTotal {
  label: string;
  amount: number;
}

/** Whitelist `{category, total}` entries, dropping non-positive totals. */
function categoryTotals(value: unknown): CategoryTotal[] {
  if (!Array.isArray(value)) return [];
  const totals: CategoryTotal[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const label = typeof entry.category === 'string' ? entry.category.trim() : '';
    const amount =
      typeof entry.total === 'number' && Number.isFinite(entry.total) ? entry.total : 0;
    if (!label || amount <= 0) continue;
    totals.push({ label, amount });
  }
  return totals;
}

/**
 * Normalize the insight_spending_breakdown payload into a primitive pie card:
 * one period and category shares. The latest complete month wins; if none is
 * complete, the latest positive month is used, then the window-wide categories.
 * The top five categories stay distinct and the rest merge into `Other`.
 */
export function spendingPieCard(
  payload: unknown,
  afterText: number,
  startId: number
): SpendingPieEntityCard | null {
  try {
    if (!isRecord(payload)) return null;

    const currentKey = utcMonthKey(new Date());
    const breakdowns: Array<{
      month: string;
      total: number;
      categories: CategoryTotal[];
    }> = [];
    if (Array.isArray(payload.monthlyBreakdown)) {
      for (const entry of payload.monthlyBreakdown) {
        if (!isRecord(entry)) continue;
        const month = typeof entry.month === 'string' ? entry.month : '';
        if (!MONTH_KEY.test(month)) continue;
        const total =
          typeof entry.total === 'number' && Number.isFinite(entry.total) ? entry.total : 0;
        breakdowns.push({ month, total, categories: categoryTotals(entry.categories) });
      }
    }

    const complete = breakdowns.filter(
      (entry) => entry.month < currentKey && entry.total > 0 && entry.categories.length > 0
    );
    const pool = complete.length > 0
      ? complete
      : breakdowns.filter((entry) => entry.total > 0 && entry.categories.length > 0);
    const latest = pool.reduce<(typeof pool)[number] | undefined>(
      (best, entry) => (!best || entry.month > best.month ? entry : best),
      undefined
    );

    let categories: CategoryTotal[];
    let total: number;
    let period: string;
    if (latest) {
      categories = latest.categories;
      total = latest.total;
      period = spendingPiePeriod(latest.month);
    } else {
      categories = categoryTotals(payload.categories);
      total =
        typeof payload.totalSpend === 'number' && Number.isFinite(payload.totalSpend)
          ? payload.totalSpend
          : 0;
      period = 'Last 3 months';
    }
    if (categories.length === 0) return null;

    const sorted = [...categories].sort((a, b) => b.amount - a.amount);
    const top = sorted.slice(0, 5);
    const remainder = sorted.slice(5);
    const slices: Array<{ label: string; amount: number }> = top.map((entry) => ({
      label: entry.label,
      amount: entry.amount
    }));
    if (remainder.length > 0) {
      slices.push({
        label: 'Other',
        amount: remainder.reduce((sum, entry) => sum + entry.amount, 0)
      });
    }

    const sliceTotal = slices.reduce((sum, slice) => sum + slice.amount, 0);
    if (sliceTotal <= 0) return null;
    const denominator = total > 0 ? total : sliceTotal;
    const rawShares = slices.map((slice) => slice.amount / denominator);
    const shareSum = rawShares.reduce((sum, share) => sum + share, 0);
    if (shareSum <= 0) return null;

    const normalized: PieSlice[] = slices.map((slice, index) => ({
      label: slice.label,
      amount: slice.amount,
      share: rawShares[index] / shareSum
    }));

    const card: SpendingPieEntityCard = {
      id: typeof startId === 'number' && Number.isFinite(startId) ? startId : 1,
      entityId: SPENDING_PIE_ENTITY_ID,
      kind: 'spending-pie',
      payload: { period, total: denominator, slices: normalized }
    };
    if (typeof afterText === 'number' && Number.isFinite(afterText)) {
      card.afterText = afterText;
    }
    return card;
  } catch {
    return null;
  }
}

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function optionalTrimmed(value: unknown): string | undefined {
  const text = trimmedString(value);
  return text.length > 0 ? text : undefined;
}

/** Keep only the last four digits, preserving an existing bullet/star mask. */
export function normalizeMaskedAccountNumber(value: unknown): string {
  const raw = trimmedString(value);
  if (!raw) return '';
  const digits = raw.replace(/\D+/g, '');
  if (digits.length >= 4) return `\u2022\u2022\u2022\u2022 ${digits.slice(-4)}`;
  if (/[•*]/.test(raw)) return raw.replace(/\s+/g, ' ').trim();
  return raw;
}

/**
 * Normalize insight_upcoming_bills into one primitive bill card. The card shows
 * the largest bill (earliest due date breaks ties), matching the deterministic
 * prose that names the largest amount. Malformed or empty bills are skipped.
 */
export function billCard(
  payload: unknown,
  afterText: number,
  startId: number,
  context?: { customerId?: string }
): BillEntityCard | null {
  try {
    if (!isRecord(payload) || !Array.isArray(payload.bills)) return null;

    interface Candidate {
      index: number;
      billId: string;
      payee: string;
      amount: number | null;
      dueDate: string;
      status?: string;
      accountId?: string;
    }

    const candidates: Candidate[] = [];
    for (let index = 0; index < payload.bills.length; index += 1) {
      const entry = payload.bills[index];
      if (!isRecord(entry)) continue;

      const payee = trimmedString(entry.payee);
      if (!payee) continue;

      const amount = finiteNumberOrNull(entry.amount);
      // Negative amounts are malformed for a bill; zero stays visible.
      if (amount !== null && amount < 0) continue;

      const dueDate = trimmedString(entry.dueDate);
      if (!dueDate) continue;

      const rawId = entry.billId ?? entry._id;
      const billId =
        (typeof rawId === 'string' || typeof rawId === 'number') &&
        String(rawId).trim().length > 0
          ? String(rawId).trim()
          : '';

      candidates.push({
        index,
        billId,
        payee,
        amount,
        dueDate,
        ...(optionalTrimmed(entry.status) ? { status: optionalTrimmed(entry.status) } : {}),
        ...(optionalTrimmed(entry.accountId)
          ? { accountId: optionalTrimmed(entry.accountId) }
          : {})
      });
    }

    if (candidates.length === 0) return null;

    const selected = candidates.reduce((best, entry) => {
      const bestAmount = best.amount === null ? Number.NEGATIVE_INFINITY : best.amount;
      const entryAmount = entry.amount === null ? Number.NEGATIVE_INFINITY : entry.amount;
      if (entryAmount !== bestAmount) return entryAmount > bestAmount ? entry : best;
      if (entry.dueDate !== best.dueDate) return entry.dueDate < best.dueDate ? entry : best;
      return entry.index < best.index ? entry : best;
    });

    const customerId = optionalTrimmed(context?.customerId);
    const payloadOut: BillCardPayload = {
      billId: selected.billId,
      payee: selected.payee,
      amount: selected.amount,
      dueDate: selected.dueDate,
      ...(selected.status ? { status: selected.status } : {}),
      ...(selected.accountId ? { accountId: selected.accountId } : {}),
      ...(customerId ? { customerId } : {})
    };

    const entityId =
      payloadOut.billId ||
      `bill|${payloadOut.payee}|${payloadOut.dueDate}|${
        payloadOut.amount === null ? 'null' : String(payloadOut.amount)
      }`;

    const card: BillEntityCard = {
      id: typeof startId === 'number' && Number.isFinite(startId) ? startId : 1,
      entityId,
      kind: 'bill',
      payload: payloadOut
    };
    if (typeof afterText === 'number' && Number.isFinite(afterText)) {
      card.afterText = afterText;
    }
    return card;
  } catch {
    return null;
  }
}

/**
 * Build a single-account card. Account lists (zero or more than one row) return
 * null so the prose answers instead of rendering an all-accounts dump.
 */
export function accountCard(
  payload: unknown,
  afterText: number,
  startId: number,
  context?: { customerId?: string }
): AccountEntityCard | null {
  try {
    const items = asItems(payload);
    if (items.length !== 1) return null;

    const item = items[0];
    const rawId = item._id ?? item.id;
    const accountId =
      (typeof rawId === 'string' || typeof rawId === 'number') &&
      String(rawId).trim().length > 0
        ? String(rawId).trim()
        : '';
    const type = trimmedString(item.type);
    if (!accountId || !type) return null;

    const nickname = trimmedString(item.nickname) || type;
    const maskedNumber = normalizeMaskedAccountNumber(
      item.accountNumber ?? item.account_number
    );
    const customerId =
      optionalTrimmed(item.customerId ?? item.customer_id) ??
      optionalTrimmed(context?.customerId);

    const payloadOut: AccountCardPayload = {
      accountId,
      nickname,
      type,
      maskedNumber,
      balance: finiteNumberOrNull(item.balance),
      rewards: finiteNumberOrNull(item.rewards),
      ...(customerId ? { customerId } : {})
    };

    const card: AccountEntityCard = {
      id: typeof startId === 'number' && Number.isFinite(startId) ? startId : 1,
      entityId: `account:${accountId}`,
      kind: 'account',
      payload: payloadOut
    };
    if (typeof afterText === 'number' && Number.isFinite(afterText)) {
      card.afterText = afterText;
    }
    return card;
  } catch {
    return null;
  }
}

/**
 * Build one primitive loan card from a loans tool payload. When several loans
 * are returned, the largest balance wins (type/description breaks ties);
 * malformed rows and rows without an id or type/description are skipped.
 */
export function loanCard(
  payload: unknown,
  afterText: number,
  startId: number,
  context?: { customerId?: string }
): LoanEntityCard | null {
  try {
    const items = asItems(payload);
    if (items.length === 0) return null;

    interface Candidate {
      index: number;
      loanId: string;
      type: string;
      balance: number | null;
      monthlyPayment: number | null;
      status?: string;
      accountId?: string;
    }

    const candidates: Candidate[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const rawId = item._id ?? item.id;
      const loanId =
        (typeof rawId === 'string' || typeof rawId === 'number') &&
        String(rawId).trim().length > 0
          ? String(rawId).trim()
          : '';
      const label = trimmedString(item.type) || trimmedString(item.description);
      if (!loanId || !label) continue;

      candidates.push({
        index,
        loanId,
        type: label,
        balance: finiteNumberOrNull(item.amount),
        monthlyPayment: finiteNumberOrNull(item.monthlyPayment),
        ...(optionalTrimmed(item.status) ? { status: optionalTrimmed(item.status) } : {}),
        ...(optionalTrimmed(item.accountId) ? { accountId: optionalTrimmed(item.accountId) } : {})
      });
    }

    if (candidates.length === 0) return null;

    const selected = candidates.reduce((best, entry) => {
      const bestBalance = best.balance === null ? Number.NEGATIVE_INFINITY : best.balance;
      const entryBalance = entry.balance === null ? Number.NEGATIVE_INFINITY : entry.balance;
      if (entryBalance !== bestBalance) return entryBalance > bestBalance ? entry : best;
      if (entry.type !== best.type) return entry.type < best.type ? entry : best;
      return entry.index < best.index ? entry : best;
    });

    const customerId = optionalTrimmed(context?.customerId);

    const payloadOut: LoanCardPayload = {
      loanId: selected.loanId,
      type: selected.type,
      balance: selected.balance,
      monthlyPayment: selected.monthlyPayment,
      ...(selected.status ? { status: selected.status } : {}),
      ...(selected.accountId ? { accountId: selected.accountId } : {}),
      ...(customerId ? { customerId } : {})
    };

    const card: LoanEntityCard = {
      id: typeof startId === 'number' && Number.isFinite(startId) ? startId : 1,
      entityId: `loan:${selected.loanId}`,
      kind: 'loan',
      payload: payloadOut
    };
    if (typeof afterText === 'number' && Number.isFinite(afterText)) {
      card.afterText = afterText;
    }
    return card;
  } catch {
    return null;
  }
}

function locationAddress(value: unknown): string {
  if (!isRecord(value)) return '';
  const street = trimmedString(value.street);
  const city = trimmedString(value.city);
  const state = trimmedString(value.state);
  const zip = trimmedString(value.zip);
  const cityStateZip = [city, [state, zip].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return [street, cityStateZip].filter(Boolean).join(', ');
}

function locationHours(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const text = value.trim();
    return text.length > 0 ? text : undefined;
  }
  if (!Array.isArray(value)) return undefined;
  const parts = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/** Parse a finite, in-range coordinate pair; both values or nothing. */
function locationCoordinates(
  latValue: unknown,
  lngValue: unknown
): { lat: number; lng: number } | null {
  const lat = finiteNumberOrNull(latValue);
  const lng = finiteNumberOrNull(lngValue);
  if (
    lat === null ||
    lng === null ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return { lat, lng };
}

/**
 * Build one primitive location card from an ATM/branch payload. The first
 * whitelisted result is shown; ATMs carry no street address, so `address`
 * stays empty rather than inventing one.
 */
export function locationCard(
  payload: unknown,
  afterText: number,
  startId: number,
  context?: { customerId?: string; type?: 'atm' | 'branch' }
): LocationEntityCard | null {
  try {
    const items = asItems(payload);
    for (const item of items) {
      const rawId = item._id ?? item.id;
      const locationId =
        (typeof rawId === 'string' || typeof rawId === 'number') &&
        String(rawId).trim().length > 0
          ? String(rawId).trim()
          : '';
      const name = trimmedString(item.name);
      if (!locationId || !name) continue;

      const hours = locationHours(item.hours);
      const address = locationAddress(item.address);
      const coords = locationCoordinates(item.lat, item.lng);
      const distance = finiteNumberOrNull(item.distanceMiles);
      const type =
        context?.type ?? (address ? 'branch' : coords ? 'atm' : undefined);
      const customerId = optionalTrimmed(context?.customerId);
      const payloadOut: LocationCardPayload = {
        locationId,
        name,
        address,
        ...(hours ? { hours } : {}),
        ...(type ? { type } : {}),
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        ...(distance !== null && distance >= 0 ? { distanceMiles: distance } : {}),
        ...(customerId ? { customerId } : {})
      };

      const card: LocationEntityCard = {
        id: typeof startId === 'number' && Number.isFinite(startId) ? startId : 1,
        entityId: `location:${locationId}`,
        kind: 'location',
        payload: payloadOut
      };
      if (typeof afterText === 'number' && Number.isFinite(afterText)) {
        card.afterText = afterText;
      }
      return card;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build one primitive recurring-charge card. The largest average amount wins;
 * the source has no cadence or next date, so none is invented.
 */
export function recurringCard(
  payload: unknown,
  afterText: number,
  startId: number,
  context?: { customerId?: string }
): RecurringChargeEntityCard | null {
  try {
    if (!isRecord(payload) || !Array.isArray(payload.recurringCharges)) return null;

    interface Candidate {
      index: number;
      description: string;
      averageAmount: number | null;
      monthsSeen: number;
      lastDate: string;
    }

    const candidates: Candidate[] = [];
    for (let index = 0; index < payload.recurringCharges.length; index += 1) {
      const entry = payload.recurringCharges[index];
      if (!isRecord(entry)) continue;
      const description = trimmedString(entry.description);
      if (!description) continue;
      const monthsSeen =
        typeof entry.monthsSeen === 'number' && Number.isFinite(entry.monthsSeen)
          ? Math.max(0, Math.floor(entry.monthsSeen))
          : 0;
      candidates.push({
        index,
        description,
        averageAmount: finiteNumberOrNull(entry.averageAmount),
        monthsSeen,
        lastDate: trimmedString(entry.lastDate)
      });
    }

    if (candidates.length === 0) return null;

    const selected = candidates.reduce((best, entry) => {
      const bestAmount =
        best.averageAmount === null ? Number.NEGATIVE_INFINITY : best.averageAmount;
      const entryAmount =
        entry.averageAmount === null ? Number.NEGATIVE_INFINITY : entry.averageAmount;
      if (entryAmount !== bestAmount) return entryAmount > bestAmount ? entry : best;
      return entry.index < best.index ? entry : best;
    });

    const amountKey =
      selected.averageAmount === null ? 'null' : String(selected.averageAmount);
    const chargeId = `${selected.description}|${amountKey}`;
    const customerId = optionalTrimmed(context?.customerId);
    const payloadOut: RecurringChargeCardPayload = {
      chargeId,
      description: selected.description,
      averageAmount: selected.averageAmount,
      monthsSeen: selected.monthsSeen,
      lastDate: selected.lastDate,
      ...(customerId ? { customerId } : {})
    };

    const card: RecurringChargeEntityCard = {
      id: typeof startId === 'number' && Number.isFinite(startId) ? startId : 1,
      entityId: chargeId,
      kind: 'recurring',
      payload: payloadOut
    };
    if (typeof afterText === 'number' && Number.isFinite(afterText)) {
      card.afterText = afterText;
    }
    return card;
  } catch {
    return null;
  }
}

function isCreditAccountType(value: string): boolean {
  const type = value.trim().toLowerCase();
  return type === 'credit card' || type === 'credit';
}

/**
 * Build one primitive reward card. Account lists show the credit account with
 * the highest positive rewards; otherwise a positive `totalRewards` becomes a
 * "Total rewards" card. Points are never converted into an invented dollar
 * value.
 */
export function rewardCard(
  payload: unknown,
  afterText: number,
  startId: number,
  context?: { customerId?: string }
): RewardEntityCard | null {
  try {
    const items = asItems(payload);
    const customerId = optionalTrimmed(context?.customerId);

    interface Candidate {
      index: number;
      accountId: string;
      label: string;
      points: number;
    }

    const candidates: Candidate[] = [];
    const hasRewardRows = items.some((item) => 'rewards' in item);
    if (hasRewardRows) {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (!isCreditAccountType(trimmedString(item.type))) continue;
        const points = finiteNumberOrNull(item.rewards);
        if (points === null || points <= 0) continue;

        const rawId = item._id ?? item.id;
        const accountId =
          (typeof rawId === 'string' || typeof rawId === 'number') &&
          String(rawId).trim().length > 0
            ? String(rawId).trim()
            : '';
        if (!accountId) continue;
        const label = trimmedString(item.nickname) || trimmedString(item.type) || 'Credit card';
        candidates.push({ index, accountId, label, points });
      }
    }

    let payloadOut: RewardCardPayload;
    if (candidates.length > 0) {
      const selected = candidates.reduce((best, entry) => {
        if (entry.points !== best.points) return entry.points > best.points ? entry : best;
        return entry.index < best.index ? entry : best;
      });
      payloadOut = {
        rewardId: selected.accountId || 'total',
        label: selected.label,
        points: selected.points,
        ...(selected.accountId ? { accountId: selected.accountId } : {}),
        ...(customerId ? { customerId } : {})
      };
    } else {
      if (hasRewardRows) return null;
      const total = isRecord(payload) ? finiteNumberOrNull(payload.totalRewards) : null;
      if (total === null || total <= 0) return null;
      payloadOut = {
        rewardId: 'total',
        label: 'Total rewards',
        points: total,
        ...(customerId ? { customerId } : {})
      };
    }

    const card: RewardEntityCard = {
      id: typeof startId === 'number' && Number.isFinite(startId) ? startId : 1,
      entityId: `reward:${payloadOut.accountId ?? 'total'}`,
      kind: 'reward',
      payload: payloadOut
    };
    if (typeof afterText === 'number' && Number.isFinite(afterText)) {
      card.afterText = afterText;
    }
    return card;
  } catch {
    return null;
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function addMonthsISODate(iso: string, months: number): string | undefined {
  const match = ISO_DATE.exec(iso);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;
}

function monthsToTargetOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Build one primitive goal card from `insight_goal_projection`. The card shows
 * target, current balance, months to target, and a projected date when the
 * projection is finite. No advice, progress narrative, or on-track copy.
 */
export function goalCard(
  payload: unknown,
  afterText: number,
  startId: number,
  context?: { customerId?: string }
): GoalEntityCard | null {
  try {
    if (!isRecord(payload)) return null;

    const target = finiteNumberOrNull(payload.targetAmount);
    const current = finiteNumberOrNull(payload.currentBalance);
    if (target === null || target <= 0) return null;
    if (current === null || current < 0) return null;

    const accountId = optionalTrimmed(payload.accountId);
    const monthsToTarget = monthsToTargetOf(payload.monthsToTarget);
    const asOf = trimmedString(payload.asOf);
    const projectedDate =
      monthsToTarget === null ? undefined : addMonthsISODate(asOf, monthsToTarget);

    const customerId = optionalTrimmed(context?.customerId);
    const goalId = `goal:${accountId ?? 'account'}:${target}`;
    const payloadOut: GoalCardPayload = {
      goalId,
      target,
      current,
      monthsToTarget,
      ...(accountId ? { accountId } : {}),
      ...(projectedDate ? { projectedDate } : {}),
      ...(customerId ? { customerId } : {})
    };

    const card: GoalEntityCard = {
      id: typeof startId === 'number' && Number.isFinite(startId) ? startId : 1,
      entityId: goalId,
      kind: 'goal',
      payload: payloadOut
    };
    if (typeof afterText === 'number' && Number.isFinite(afterText)) {
      card.afterText = afterText;
    }
    return card;
  } catch {
    return null;
  }
}

interface CashflowCandidate {
  month: string;
  inflow: number;
  outflow: number;
  net: number;
}

/**
 * Build one primitive monthly cashflow card. The latest complete month wins;
 * when none is complete the last valid entry is used. At most one month is
 * shown, with no interpretation or comparison copy.
 */
export function cashflowCard(
  payload: unknown,
  afterText: number,
  startId: number
): CashflowPointEntityCard | null {
  try {
    if (!isRecord(payload) || !Array.isArray(payload.monthlyCashflow)) return null;

    const candidates: CashflowCandidate[] = [];
    for (const entry of payload.monthlyCashflow) {
      if (!isRecord(entry)) continue;
      const month = trimmedString(entry.month);
      if (!MONTH_KEY.test(month)) continue;
      const inflow = finiteNumberOrNull(entry.inflow);
      const outflow = finiteNumberOrNull(entry.outflow);
      if (inflow === null || outflow === null) continue;
      const providedNet = finiteNumberOrNull(entry.net);
      candidates.push({
        month,
        inflow,
        outflow,
        net: providedNet === null ? inflow - outflow : providedNet
      });
    }
    if (candidates.length === 0) return null;

    const currentKey = utcMonthKey(new Date());
    const complete = candidates.filter((entry) => entry.month < currentKey);
    const selected =
      complete.length > 0
        ? complete.reduce((best, entry) => (entry.month > best.month ? entry : best))
        : candidates[candidates.length - 1];

    const card: CashflowPointEntityCard = {
      id: typeof startId === 'number' && Number.isFinite(startId) ? startId : 1,
      entityId: `cashflow:${selected.month}`,
      kind: 'cashflow',
      payload: {
        period: spendingPiePeriod(selected.month),
        inflow: selected.inflow,
        outflow: selected.outflow,
        net: selected.net
      }
    };
    if (typeof afterText === 'number' && Number.isFinite(afterText)) {
      card.afterText = afterText;
    }
    return card;
  } catch {
    return null;
  }
}

function merchantAddress(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const street = trimmedString(value.street);
  const city = trimmedString(value.city);
  const state = trimmedString(value.state);
  const cityState = [city, state].filter(Boolean).join(', ');
  const text = [street, cityState].filter(Boolean).join(', ');
  return text.length > 0 ? text : undefined;
}

/**
 * Build one primitive merchant card from a merchant tool payload. The first
 * valid merchant is shown; malformed rows and rows without an id or name are
 * skipped. Never renders an entire merchant list.
 */
export function merchantCard(
  payload: unknown,
  afterText: number,
  startId: number,
  context?: { customerId?: string }
): MerchantEntityCard | null {
  try {
    const items = asItems(payload);
    for (const item of items) {
      const rawId = item._id ?? item.id;
      const merchantId =
        (typeof rawId === 'string' || typeof rawId === 'number') &&
        String(rawId).trim().length > 0
          ? String(rawId).trim()
          : '';
      const name = trimmedString(item.name);
      if (!merchantId || !name) continue;

      const category = optionalTrimmed(item.category);
      const address = merchantAddress(item.address);
      const customerId = optionalTrimmed(context?.customerId);
      const payloadOut: MerchantCardPayload = {
        merchantId,
        name,
        ...(category ? { category } : {}),
        ...(address ? { address } : {}),
        ...(customerId ? { customerId } : {})
      };

      const card: MerchantEntityCard = {
        id: typeof startId === 'number' && Number.isFinite(startId) ? startId : 1,
        entityId: `merchant:${merchantId}`,
        kind: 'merchant',
        payload: payloadOut
      };
      if (typeof afterText === 'number' && Number.isFinite(afterText)) {
        card.afterText = afterText;
      }
      return card;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build one merchant card from `insight_top_merchants`. The tool returns the
 * ranked merchant rows, but the answer is a single card for the top merchant,
 * so the first item is synthesized into a one-item merchant payload.
 */
export function topMerchantCard(
  payload: unknown,
  afterText: number,
  startId: number,
  context?: { customerId?: string }
): MerchantEntityCard | null {
  try {
    if (!isRecord(payload) || !Array.isArray(payload.items)) return null;
    const item = payload.items[0];
    if (!isRecord(item)) return null;

    const name = trimmedString(item.name);
    if (!name) return null;

    const rawId = item._id ?? item.id;
    const idText =
      (typeof rawId === 'string' || typeof rawId === 'number') &&
      String(rawId).trim().length > 0
        ? String(rawId).trim()
        : '';
    const merchantId = idText || `top-merchant:${name}`;
    const category = optionalTrimmed(item.category);

    const synthesized: Record<string, unknown> = { _id: merchantId, name };
    if (category) synthesized.category = category;
    return merchantCard({ items: [synthesized] }, afterText, startId, context);
  } catch {
    return null;
  }
}

function profileLocation(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const city = trimmedString(value.city);
  const state = trimmedString(value.state);
  const text = [city, state].filter(Boolean).join(', ');
  return text.length > 0 ? text : undefined;
}

/**
 * Build one primitive profile card from a single-customer payload. Lists (zero
 * or more than one row) return null so the prose answers. Only the name and
 * city/state are included; street, zip, phone, email, and account identifiers
 * never reach the payload.
 */
export function profileCard(
  payload: unknown,
  afterText: number,
  startId: number
): ProfileEntityCard | null {
  try {
    const items = asItems(payload);
    if (items.length !== 1) return null;

    const item = items[0];
    const rawId = item._id ?? item.id;
    const customerId =
      (typeof rawId === 'string' || typeof rawId === 'number') &&
      String(rawId).trim().length > 0
        ? String(rawId).trim()
        : '';
    const firstName = trimmedString(item.firstName);
    const lastName = trimmedString(item.lastName);
    const name = [firstName, lastName].filter(Boolean).join(' ');
    if (!customerId || !name) return null;

    const location = profileLocation(item.address);
    const payloadOut: ProfileCardPayload = {
      customerId,
      name,
      ...(location ? { location } : {})
    };

    const card: ProfileEntityCard = {
      id: typeof startId === 'number' && Number.isFinite(startId) ? startId : 1,
      entityId: `profile:${customerId}`,
      kind: 'profile',
      payload: payloadOut
    };
    if (typeof afterText === 'number' && Number.isFinite(afterText)) {
      card.afterText = afterText;
    }
    return card;
  } catch {
    return null;
  }
}

/**
 * Build one ClimateWise card from the full insight report (or `{ report }`).
 * The chat renders the same adaptive card as `/climatewise`, so the payload
 * carries the whole report rather than a reduced score summary. Malformed
 * reports return null so a broken card never renders. `topCategory` is derived
 * from the highest-kg category so follow-ups can name it without trusting an
 * unvalidated label.
 */
export function climateWiseCard(
  payload: unknown,
  afterText: number,
  startId: number,
  context?: { customerId?: string }
): ClimateWiseEntityCard | null {
  try {
    const source =
      isRecord(payload) && isRecord(payload.report) ? payload.report : payload;
    if (!isRecord(source)) return null;

    const score = finiteNumberOrNull(source.score);
    if (score === null) return null;

    const tier = trimmedString(source.tier);
    if (!tier) return null;

    const totalKg = finiteNumberOrNull(source.totalKg);
    if (totalKg === null || totalKg < 0) return null;

    if (!Array.isArray(source.categories)) return null;
    const categories = source.categories.filter(
      (entry): entry is Record<string, unknown> =>
        isRecord(entry) && typeof entry.id === 'string' && finiteNumberOrNull(entry.kg) !== null
    );

    const rawDays = finiteNumberOrNull(source.days);
    const days = rawDays !== null && rawDays > 0 ? Math.round(rawDays) : 90;

    let topCategory: string | undefined;
    let topKg = 0;
    for (const entry of categories) {
      const kg = finiteNumberOrNull(entry.kg);
      if (kg === null || kg <= 0) continue;
      const label = trimmedString(entry.label) || trimmedString(entry.id);
      if (!label) continue;
      if (kg > topKg) {
        topKg = kg;
        topCategory = label;
      }
    }

    const customerId = optionalTrimmed(context?.customerId);

    // Keep the full report for the adaptive card, but guarantee the arrays it
    // iterates over exist so a sparse payload cannot crash the render.
    const report = {
      ...(source as unknown as ClimateReport),
      score,
      tier,
      totalKg,
      days,
      categories: categories as unknown as ClimateReport['categories'],
      topPurchases: Array.isArray(source.topPurchases)
        ? (source.topPurchases as unknown as ClimateReport['topPurchases'])
        : []
    };

    const payloadOut: ClimateWiseCardPayload = {
      report,
      ...(topCategory ? { topCategory } : {}),
      ...(customerId ? { customerId } : {})
    };

    const card: ClimateWiseEntityCard = {
      id: typeof startId === 'number' && Number.isFinite(startId) ? startId : 1,
      entityId: 'climatewise',
      kind: 'climatewise',
      payload: payloadOut
    };
    if (typeof afterText === 'number' && Number.isFinite(afterText)) {
      card.afterText = afterText;
    }
    return card;
  } catch {
    return null;
  }
}

/**
 * Merge rows into a single list card, dedupe by transaction id, cap the rows,
 * and keep the earliest anchor (a real anchor beats end-of-text).
 */
export function mergeTransactionListCards(
  existing: TransactionListEntityCard | undefined,
  incoming: TransactionListEntityCard,
  cap = 8
): TransactionListEntityCard {
  const rows = uniqueRows([
    ...(existing?.payload?.rows ?? []),
    ...(incoming?.payload?.rows ?? [])
  ]);
  const visible = rows.slice(0, normalizeListCap(cap));

  // Each card's declared total is its visible rows plus the rows it already
  // reported as hidden. Subtracting rows that deduped away keeps the merged
  // "more" count honest when both feeds overlap.
  const existingTotal = existing
    ? existing.payload.rows.length + existing.payload.more
    : 0;
  const incomingTotal = incoming
    ? incoming.payload.rows.length + incoming.payload.more
    : 0;
  const duplicateCount =
    (existing?.payload.rows.length ?? 0) +
    (incoming?.payload.rows.length ?? 0) -
    rows.length;
  const total = Math.max(rows.length, existingTotal + incomingTotal - duplicateCount);

  const anchors = [existing?.afterText, incoming?.afterText].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  );

  const card: TransactionListEntityCard = {
    id: existing?.id ?? incoming?.id ?? 1,
    entityId: TRANSACTION_LIST_ENTITY_ID,
    kind: 'transaction-list',
    payload: { rows: visible, more: Math.max(0, total - visible.length) }
  };
  if (anchors.length > 0) card.afterText = Math.min(...anchors);
  return card;
}

interface TextToken {
  norm: string;
  end: number;
}

const NOISE_TOKENS = new Set([
  'THE',
  'POS',
  'PURCHASE',
  'DEBIT',
  'CREDIT',
  'CARD',
  'CHECKCARD',
  'ACH',
  'PAYMENT',
  'TRANSACTION'
]);

const TRAILING_PUNCTUATION = ':,;.!?';

function tokenize(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  const pattern = /[A-Za-z0-9]+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    tokens.push({
      norm: match[0].toUpperCase(),
      end: match.index + match[0].length
    });
  }
  return tokens;
}

/** Normalized match keys for a merchant description (drops a `.com` suffix). */
function descriptionTokens(description: string): string[] {
  if (typeof description !== 'string') return [];
  const tokens = tokenize(description).map((token) => token.norm);
  if (tokens.length > 1 && tokens[tokens.length - 1] === 'COM' && /\.com\b/i.test(description)) {
    tokens.pop();
  }
  return tokens;
}

function firstMeaningfulToken(tokens: string[]): string {
  const meaningful = tokens.find(
    (token) => !NOISE_TOKENS.has(token) && !/^\d+$/.test(token)
  );
  return meaningful ?? tokens[0] ?? '';
}

interface TokenMatch {
  index: number;
  length: number;
}

function findTokenMatch(
  textTokens: TextToken[],
  keys: string[],
  cursor: number
): TokenMatch | null {
  if (keys.length === 0) return null;
  for (let index = cursor; index + keys.length <= textTokens.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < keys.length; offset += 1) {
      if (textTokens[index + offset].norm !== keys[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return { index, length: keys.length };
  }
  return null;
}

/** Include the following `.com`, whitespace, and one punctuation char. */
function anchorEnd(source: string, tokenEnd: number): number {
  let offset = tokenEnd;
  const suffix = /^\.\s*com\b/i.exec(source.slice(offset));
  if (suffix) offset += suffix[0].length;
  while (offset < source.length && /\s/.test(source[offset])) offset += 1;
  if (offset < source.length && TRAILING_PUNCTUATION.includes(source[offset])) offset += 1;
  return offset;
}

/** Candidate token runs used to anchor a card after the entity it names. */
function anchorCandidates(card: EntityCard): string[][] {
  if (card.kind === 'transaction') {
    const description =
      typeof card.payload?.description === 'string' ? card.payload.description : '';
    const keys = descriptionTokens(description);
    const candidates = keys.length > 0 ? [keys] : [];
    if (keys.length > 1) {
      const token = firstMeaningfulToken(keys);
      if (token) candidates.push([token]);
    }
    return candidates;
  }

  if (card.kind === 'bill') {
    const payee = typeof card.payload?.payee === 'string' ? card.payload.payee : '';
    const keys = tokenize(payee).map((token) => token.norm);
    const candidates = keys.length > 0 ? [keys] : [];
    if (keys.length > 1) {
      const token = firstMeaningfulToken(keys);
      if (token) candidates.push([token]);
    }
    return candidates;
  }

  if (card.kind === 'account') {
    const nickname =
      typeof card.payload?.nickname === 'string' ? card.payload.nickname : '';
    const nicknameKeys = tokenize(nickname).map((token) => token.norm);
    const typeKeys = tokenize(
      typeof card.payload?.type === 'string' ? card.payload.type : ''
    ).map((token) => token.norm);

    const candidates: string[][] = [];
    if (nicknameKeys.length > 0) candidates.push(nicknameKeys);
    if (nicknameKeys.length > 1) {
      const token = firstMeaningfulToken(nicknameKeys);
      if (token) candidates.push([token]);
    }
    if (typeKeys.length > 0) candidates.push(typeKeys);
    return candidates;
  }

  if (card.kind === 'loan') {
    const label = typeof card.payload?.type === 'string' ? card.payload.type : '';
    const keys = tokenize(label).map((token) => token.norm);
    const candidates = keys.length > 0 ? [keys] : [];
    if (keys.length > 1) {
      const token = firstMeaningfulToken(keys);
      if (token) candidates.push([token]);
    }
    return candidates;
  }

  if (card.kind === 'location') {
    const name = typeof card.payload?.name === 'string' ? card.payload.name : '';
    const keys = tokenize(name).map((token) => token.norm);
    const candidates = keys.length > 0 ? [keys] : [];
    if (keys.length > 1) {
      const token = firstMeaningfulToken(keys);
      if (token) candidates.push([token]);
    }
    return candidates;
  }

  if (card.kind === 'recurring') {
    const description =
      typeof card.payload?.description === 'string' ? card.payload.description : '';
    const keys = descriptionTokens(description);
    const candidates = keys.length > 0 ? [keys] : [];
    if (keys.length > 1) {
      const token = firstMeaningfulToken(keys);
      if (token) candidates.push([token]);
    }
    return candidates;
  }

  if (card.kind === 'reward') {
    const label = typeof card.payload?.label === 'string' ? card.payload.label : '';
    const keys = tokenize(label).map((token) => token.norm);
    return keys.length > 0 ? [keys] : [];
  }

  if (card.kind === 'cashflow') {
    const period = typeof card.payload?.period === 'string' ? card.payload.period : '';
    const keys = tokenize(period).map((token) => token.norm);
    return keys.length > 0 ? [keys] : [];
  }

  if (card.kind === 'merchant' || card.kind === 'profile') {
    const name = typeof card.payload?.name === 'string' ? card.payload.name : '';
    const keys = tokenize(name).map((token) => token.norm);
    const candidates = keys.length > 0 ? [keys] : [];
    if (keys.length > 1) {
      const token = firstMeaningfulToken(keys);
      if (token) candidates.push([token]);
    }
    return candidates;
  }

  return [];
}

/**
 * Reposition entity cards after the mention they introduce: transactions and
 * recurring charges after their description, bills after their complete paragraph, accounts
 * after their nickname (falling back to type), loans after their type,
 * locations after their name, rewards after their label, cashflow after its
 * period, and merchants/profiles after their name. Returns copies; cards with
 * no mention keep their existing `afterText`. Non-anchored kinds (lists, pies,
 * goals) are left unchanged. Pending bill paragraphs stay buffered until a
 * paragraph boundary arrives, so their cards never interrupt streamed context.
 */
export function anchorEntityCards(text: string, cards: EntityCard[], options: { pending?: boolean } = {}): EntityCard[] {
  const source = typeof text === 'string' ? text : '';
  const list = Array.isArray(cards) ? cards : [];

  try {
    const textTokens = tokenize(source);
    let cursor = 0;
    const anchored: EntityCard[] = [];

    for (const card of list) {
      if (!card || typeof card !== 'object' || Array.isArray(card)) continue;

      if (
        card.kind !== 'transaction' &&
        card.kind !== 'bill' &&
        card.kind !== 'account' &&
        card.kind !== 'loan' &&
        card.kind !== 'location' &&
        card.kind !== 'recurring' &&
        card.kind !== 'reward' &&
        card.kind !== 'cashflow' &&
        card.kind !== 'merchant' &&
        card.kind !== 'profile'
      ) {
        anchored.push({ ...card });
        continue;
      }

      const candidates = anchorCandidates(card);
      let match: TokenMatch | null = null;
      for (const keys of candidates) {
        match = findTokenMatch(textTokens, keys, cursor);
        if (match) break;
      }

      if (!match) {
        anchored.push(card.kind === 'bill' ? { ...card, afterText: options.pending ? Number.MAX_SAFE_INTEGER : source.length } : { ...card });
        continue;
      }

      const last = textTokens[match.index + match.length - 1];
      let offset = anchorEnd(source, last.end);
      if (card.kind === 'bill') {
        // A bill follows its complete paragraph/list item, never just its payee.
        const boundary = /\n[ \t]*\n|\n(?=[ \t]*(?:[-*]|\d+[.)])\s)/.exec(source.slice(last.end));
        offset = boundary ? last.end + boundary.index : options.pending ? Number.MAX_SAFE_INTEGER : source.length;
      } else if (card.kind === 'transaction' && card.payload.flag) {
        const explanation = anomalyContextSentence(card);
        const explanationAt = source.indexOf(explanation);
        if (explanationAt >= 0) offset = explanationAt + explanation.length;
      }
      anchored.push({ ...card, afterText: offset });
      cursor = match.index + match.length;
    }

    return anchored;
  } catch {
    return list.filter(
      (card) => Boolean(card) && typeof card === 'object' && !Array.isArray(card)
    ).map((card) => ({ ...card }));
  }
}

/**
 * Reposition transaction cards after the merchant mention in the assistant
 * text. Thin wrapper over `anchorEntityCards` for existing callers.
 */
export function anchorTransactionCards(text: string, cards: EntityCard[]): EntityCard[] {
  return anchorEntityCards(text, cards);
}

export function anomalyContextSentence(card: TransactionEntityCard): string {
  const description = card.payload.description.trim() || 'This charge';
  if (card.payload?.flag === 'duplicate') {
    return `${description} is a possible duplicate because the same merchant charged the same amount again within three days.`;
  }
  const comparison = card.payload.comparisonScope === 'merchant' ? 'your usual purchases at this merchant' : 'your recent purchases on this account';
  return `${description} is an unusually large purchase compared with ${comparison}.`;
}

/** Keep model prose, adding a grounded reason for any flagged charge it missed. */
export function completeAnomalyContext(text: string, cards: EntityCard[]): string {
  const source = typeof text === 'string' ? text : '';
  const segments = source.split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z])/);
  const additions: string[] = [];
  for (const card of cards) {
    if (card.kind !== 'transaction' || !card.payload.flag) continue;
    const keys = descriptionTokens(card.payload.description);
    const token = firstMeaningfulToken(keys);
    const reason = card.payload.flag === 'duplicate'
      ? /same (?:amount|merchant)|charged (?:twice|again)|(?:duplicate|repeat).{0,80}(?:days?|twice|again|amount)/i
      : /\b(?:larger|higher|large|high)\b.{0,80}\b(?:usual|typical|recent|other|normal)\b|\b(?:usual|typical|recent|other|normal)\b.{0,80}\b(?:larger|higher|large|high)\b/i;
    const explained = segments.some((segment) => findTokenMatch(tokenize(segment), keys, 0) !== null && reason.test(segment)) ||
      (!!token && segments.some((segment) => findTokenMatch(tokenize(segment), [token], 0) !== null && reason.test(segment)));
    if (!explained) additions.push(anomalyContextSentence(card));
  }
  if (!additions.length) return source.trim();
  // Keep the next step after every explanation/card. Otherwise appending a
  // missing reason can strand the model's closing advice above the last card.
  const closingAt = source.search(/\b(?:If you don[’']t recognize|You can review|You can check|You can report)\b/i);
  const before = closingAt < 0 ? source.trim() : source.slice(0, closingAt).trim();
  const closing = closingAt < 0 ? '' : source.slice(closingAt).trim();
  return [before, ...new Set(additions), closing].filter(Boolean).join('\n\n');
}

/**
 * Deterministic explanation for anomaly cards, used when the model returned no
 * prose. Every displayed finding gets a reason; amounts and dates stay in cards.
 */
export function anomalyExplanation(cards: EntityCard[]): string {
  try {
    const list = Array.isArray(cards) ? cards : [];
    const transactions = list
      .filter(
        (card): card is TransactionEntityCard =>
          Boolean(card) &&
          typeof card === 'object' &&
          !Array.isArray(card) &&
          card.kind === 'transaction' && !!card.payload.flag
      );
    if (transactions.length === 0) return '';

    // Lead with the unusual amount, matching the prose rhythm.
    const ordered = [
      ...transactions.filter((card) => card.payload?.flag !== 'duplicate'),
      ...transactions.filter((card) => card.payload?.flag === 'duplicate')
    ];
    return `${completeAnomalyContext('', ordered)}\n\nYou can review these charges and report anything you don’t recognize.`;
  } catch {
    return '';
  }
}

/**
 * Merge anomaly transaction cards by entityId. Every flagged transaction gets
 * its own inline card without a default cutoff; the old
 * 1–2 budget applied to other cards, not anomaly findings. Non-transaction
 * cards already present (for example a transaction list or a pie) are
 * preserved unchanged and never count toward `cap`. Result order: preserved
 * non-transaction cards in their existing order, followed by anomaly cards in
 * first-seen order (existing, then incoming), capped at `cap` anomaly cards.
 * Malformed entries are ignored.
 */
export function mergeEntityCards(
  existing: EntityCard[],
  incoming: EntityCard[],
  cap = Number.MAX_SAFE_INTEGER
): EntityCard[] {
  const limit = normalizeCap(cap);

  const preserved: EntityCard[] = [];
  const anomalies: EntityCard[] = [];
  const preservedIds = new Set<string>();
  const seenAnomalies = new Set<string>();

  const addPreserved = (cards: unknown): void => {
    if (!Array.isArray(cards)) return;
    for (const card of cards) {
      if (!isRecord(card)) continue;
      if (typeof card.entityId !== 'string') continue;
      if (card.kind === 'transaction') continue;
      if (preservedIds.has(card.entityId)) continue;
      preservedIds.add(card.entityId);
      preserved.push(card as unknown as EntityCard);
    }
  };

  const addAnomalies = (cards: unknown): void => {
    if (!Array.isArray(cards)) return;
    for (const card of cards) {
      if (anomalies.length >= limit) return;
      if (!isRecord(card)) continue;
      if (card.kind !== 'transaction') continue;
      if (typeof card.entityId !== 'string') continue;
      if (seenAnomalies.has(card.entityId)) continue;
      seenAnomalies.add(card.entityId);
      anomalies.push(card as unknown as EntityCard);
    }
  };

  try {
    addPreserved(existing);
    addAnomalies(existing);
    addAnomalies(incoming);
  } catch {
    return [...preserved, ...anomalies];
  }

  return [...preserved, ...anomalies];
}
