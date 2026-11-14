/**
 * Client-safe inline entity-card models and normalizers.
 * Pure functions only: no server or DOM imports.
 */
import { asItems } from './cards.js';

export interface TransactionCardPayload {
  description: string;
  amount: number | null;
  date: string;
  flag: 'duplicate' | 'unusual';
  duplicateOf?: string;
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
  more: number; // rows not shown beyond the cap
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

export type EntityCard =
  | TransactionEntityCard
  | TransactionListEntityCard
  | SpendingPieEntityCard
  | BillEntityCard
  | AccountEntityCard;

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

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
 * Normalize insight_anomalies findings into at most `cap` single-transaction
 * cards. Malformed payloads and entries are skipped rather than thrown on.
 */
export function anomalyTransactionCards(
  payload: unknown,
  afterText: number,
  startId: number,
  context?: TransactionCardContext
): TransactionEntityCard[] {
  const limit = normalizeCap(context?.cap ?? 2);
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
      const payload: TransactionCardPayload = {
        description,
        amount,
        date,
        flag,
        transactionId,
        ...contextIds
      };

      if (typeof finding.duplicateOf === 'string') {
        payload.duplicateOf = finding.duplicateOf;
      }

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

    const card: TransactionListEntityCard = {
      id: typeof startId === 'number' && Number.isFinite(startId) ? startId : 1,
      entityId: TRANSACTION_LIST_ENTITY_ID,
      kind: 'transaction-list',
      payload: { rows: visible, more: rows.length - visible.length }
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

  const anchors = [existing?.afterText, incoming?.afterText].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  );

  const card: TransactionListEntityCard = {
    id: existing?.id ?? incoming?.id ?? 1,
    entityId: TRANSACTION_LIST_ENTITY_ID,
    kind: 'transaction-list',
    payload: { rows: visible, more: rows.length - visible.length }
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

  return [];
}

/**
 * Reposition entity cards after the mention they introduce: transactions after
 * their description, bills after their payee, and accounts after their nickname
 * (falling back to type). Returns copies; cards with no mention keep their
 * existing `afterText`. Non-anchored kinds (lists, pies) are left unchanged.
 */
export function anchorEntityCards(text: string, cards: EntityCard[]): EntityCard[] {
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
        card.kind !== 'account'
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
        anchored.push({ ...card });
        continue;
      }

      const last = textTokens[match.index + match.length - 1];
      const offset = anchorEnd(source, last.end);
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

function anomalyPhrase(card: TransactionEntityCard): string {
  const description =
    typeof card.payload?.description === 'string' ? card.payload.description.trim() : '';
  const at = description ? ` at ${description}` : '';
  if (card.payload?.flag === 'duplicate') {
    return `a possible duplicate transaction${at}`;
  }
  return `a suspiciously large transaction${at}`;
}

/**
 * Deterministic explanation for anomaly cards, used when the model returned no
 * prose. Names the merchants only; amounts and dates stay in the cards.
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
          card.kind === 'transaction'
      )
      .slice(0, 2);
    if (transactions.length === 0) return '';

    // Lead with the unusual amount, matching the prose rhythm.
    const ordered = [
      ...transactions.filter((card) => card.payload?.flag !== 'duplicate'),
      ...transactions.filter((card) => card.payload?.flag === 'duplicate')
    ];
    const phrases = ordered.map(anomalyPhrase);
    const tip =
      transactions.length > 1
        ? 'Review both charges and report anything you don’t recognize.'
        : 'Review the charge and report anything you don’t recognize.';

    if (phrases.length === 1) return `You have ${phrases[0]}. ${tip}`;
    return `You have ${phrases[0]} and ${phrases[1]}. ${tip}`;
  } catch {
    return '';
  }
}

/**
 * Merge anomaly transaction cards by entityId. Non-transaction cards already
 * present (for example a transaction list) are preserved unchanged and never
 * count toward `cap`. Result order: preserved non-transaction cards in their
 * existing order, followed by anomaly cards in first-seen order (existing,
 * then incoming), capped at `cap` anomaly cards.
 * Malformed entries are ignored.
 */
export function mergeEntityCards(
  existing: EntityCard[],
  incoming: EntityCard[],
  cap = 2
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
