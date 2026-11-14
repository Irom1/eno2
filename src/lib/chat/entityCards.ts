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

export type EntityCard = TransactionEntityCard | TransactionListEntityCard;

export const TRANSACTION_LIST_ENTITY_ID = 'transaction-list';

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

/**
 * Normalize insight_anomalies findings into at most `cap` single-transaction
 * cards. Malformed payloads and entries are skipped rather than thrown on.
 */
export function anomalyTransactionCards(
  payload: unknown,
  afterText: number,
  startId: number,
  cap = 2
): TransactionEntityCard[] {
  const limit = normalizeCap(cap);
  if (limit === 0) return [];

  try {
    if (!isRecord(payload) || !Array.isArray(payload.findings)) return [];
    const findings = payload.findings;

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
      const payload: TransactionCardPayload = { description, amount, date, flag };

      if (typeof finding.duplicateOf === 'string') {
        payload.duplicateOf = finding.duplicateOf;
      }

      const explicitId =
        typeof finding._id === 'string' || typeof finding._id === 'number'
          ? String(finding._id)
          : '';
      const entityId = explicitId || entityIdFor(type || 'unusual', payload);

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

function transactionRowOf(item: Record<string, unknown>): TransactionRow {
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

  const row: TransactionRow = { id, description, amount, date };
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
  cap = 8
): TransactionListEntityCard | null {
  try {
    const items = asItems(payload);
    if (items.length === 0) return null;

    const rows = uniqueRows(items.map(transactionRowOf));
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

/**
 * Reposition transaction cards after the merchant mention in the assistant
 * text. Returns copies; cards with no mention keep their existing `afterText`.
 */
export function anchorTransactionCards(text: string, cards: EntityCard[]): EntityCard[] {
  const source = typeof text === 'string' ? text : '';
  const list = Array.isArray(cards) ? cards : [];

  try {
    const textTokens = tokenize(source);
    let cursor = 0;
    const anchored: EntityCard[] = [];

    for (const card of list) {
      if (!card || typeof card !== 'object' || Array.isArray(card)) continue;

      if (card.kind !== 'transaction') {
        anchored.push({ ...card });
        continue;
      }

      const description =
        typeof card.payload?.description === 'string' ? card.payload.description : '';
      const keys = descriptionTokens(description);

      let match = findTokenMatch(textTokens, keys, cursor);
      if (!match && keys.length > 1) {
        const token = firstMeaningfulToken(keys);
        if (token) match = findTokenMatch(textTokens, [token], cursor);
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

    if (phrases.length === 1) return `You have ${phrases[0]}.`;
    return `You have ${phrases[0]} and ${phrases[1]}.`;
  } catch {
    return '';
  }
}

/**
 * Merge by entityId, preserve first occurrence order, cap the total.
 * Malformed entries are ignored.
 */
export function mergeEntityCards(
  existing: EntityCard[],
  incoming: EntityCard[],
  cap = 2
): EntityCard[] {
  const limit = normalizeCap(cap);
  if (limit === 0) return [];

  const merged: EntityCard[] = [];
  const seen = new Set<string>();

  const add = (cards: unknown): void => {
    if (!Array.isArray(cards)) return;
    for (const card of cards) {
      if (merged.length >= limit) return;
      if (!isRecord(card)) continue;
      if (typeof card.entityId !== 'string') continue;
      if (seen.has(card.entityId)) continue;
      seen.add(card.entityId);
      merged.push(card as unknown as EntityCard);
    }
  };

  try {
    add(existing);
    add(incoming);
  } catch {
    return merged;
  }

  return merged;
}
