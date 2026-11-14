/**
 * Client-safe removal of prose that merely restates values already visible in
 * inline chat cards. Pure functions, no server imports.
 */
import { dateLabel } from '../format.js';
import type { ChatCard } from './cards.js';

/**
 * Structural words that describe *what* a card is rather than *which* specific
 * value it holds. Sentences like "your savings can cover it" must survive.
 */
const STOP_WORDS = new Set([
  'account',
  'balance',
  'card',
  'credit',
  'checking',
  'savings',
  'transaction',
  'payment',
  'amount',
  'total',
  'date',
  'status',
  'type',
  'current',
  'available',
  'description',
  'rewards',
  'points',
  'month',
  'year',
  'tool',
  'items',
  'count',
  'result'
]);

/** Keys that carry identifiers or internal scoring fields that cards never show. */
const SKIP_KEYS = new Set([
  '_id',
  'id',
  'accountId',
  'account_id',
  'customerId',
  'customer_id',
  'billId',
  'bill_id',
  'tool',
  'truncated',
  'median',
  'mad',
  'threshold',
  'daysUntil'
]);

const ACCOUNT_NUMBER_KEYS = new Set(['accountnumber', 'account_number']);
const NUMERIC_TOKEN = /^[-\d$.,]+$/;

function addNumber(tokens: Set<string>, value: number): void {
  if (!Number.isFinite(value)) return;
  const amount = Math.abs(value);
  const raw = String(amount);
  const fixed = amount.toFixed(2);
  const localized = amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const localizedFixed = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const stripped = localized.replace(/,/g, '');

  tokens.add(raw);
  tokens.add(fixed);
  tokens.add(localized);
  tokens.add(localizedFixed);
  tokens.add(stripped);
  tokens.add(`$${localized}`);
  tokens.add(`$${localizedFixed}`);

  // Negative values may be rendered with a leading minus.
  if (value < 0) tokens.add(`-${raw}`);
}

function addDate(tokens: Set<string>, value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return false;

  const [, year, month, day] = match;
  const iso = `${year}-${month}-${day}`;
  tokens.add(iso);
  tokens.add(dateLabel(iso));
  tokens.add(year);
  tokens.add(month);
  tokens.add(String(Number(month)));
  tokens.add(day);
  tokens.add(String(Number(day)));
  return true;
}

function addText(tokens: Set<string>, raw: string): void {
  const value = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!value) return;

  addDate(tokens, value);

  const words = value.split(/[^a-z0-9]+/i).filter(Boolean);
  const meaningful = words.filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
  if (meaningful.length === 0) return;

  if (value.length >= 4) tokens.add(value);
  for (const word of meaningful) tokens.add(word);
}

function addAccountEnding(tokens: Set<string>, raw: string): void {
  const digits = raw.replace(/\D+/g, '');
  if (digits) tokens.add(digits.slice(-4));
}

function walk(value: unknown, key: string, tokens: Set<string>): void {
  if (Array.isArray(value)) {
    addNumber(tokens, value.length);
    for (const entry of value) walk(entry, key, tokens);
    return;
  }

  if (value && typeof value === 'object') {
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      if (SKIP_KEYS.has(entryKey)) continue;
      walk(entryValue, entryKey, tokens);
    }
    return;
  }

  if (typeof value === 'number') {
    addNumber(tokens, value);
    return;
  }

  if (typeof value === 'string') {
    const normalizedKey = key.toLowerCase();
    if (ACCOUNT_NUMBER_KEYS.has(normalizedKey) || value.includes('•')) {
      addAccountEnding(tokens, value);
    }
    addText(tokens, value);
  }
}

/** Collect every visible data token a card could be showing. */
export function cardTokens(cards: ChatCard[]): Set<string> {
  const tokens = new Set<string>();
  try {
    for (const card of cards) walk(card.payload, '', tokens);
  } catch {
    // Defensive: an unknown payload should never break the chat.
  }
  return tokens;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sentenceHasToken(sentence: string, tokens: Set<string>): boolean {
  const lower = sentence.toLowerCase();
  for (const token of tokens) {
    if (!token) continue;

    if (NUMERIC_TOKEN.test(token)) {
      const pattern = new RegExp(`(?<!\\d)${escapeRegExp(token)}(?!\\d)`);
      if (pattern.test(sentence)) return true;
      continue;
    }

    if (token.length >= 4 && lower.includes(token)) return true;
  }
  return false;
}

function splitSentences(line: string): string[] {
  return line
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * Remove sentences that restate card data. Leaves only prose that adds
 * information the cards do not already show.
 */
export function filterCardDuplication(text: string, cards: ChatCard[]): string {
  if (!text || !text.trim() || cards.length === 0) return text;

  const tokens = cardTokens(cards);
  if (tokens.size === 0) return text;

  const keptLines: string[] = [];
  for (const line of text.split(/\r\n|\n|\r/)) {
    if (!line.trim()) continue;

    const bullet = /^(\s*)([-*•])\s+(.*)$/.exec(line);
    const prefix = bullet ? `${bullet[2]} ` : '';
    const content = bullet ? bullet[3] ?? '' : line.trim();

    const kept = splitSentences(content).filter(
      (sentence) => !sentenceHasToken(sentence, tokens)
    );
    if (kept.length > 0) keptLines.push(`${prefix}${kept.join(' ')}`);
  }

  return keptLines.join('\n').trim();
}
