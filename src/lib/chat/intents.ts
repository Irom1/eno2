/**
 * Client-safe intent classification for a user prompt.
 * Pure functions only: no server imports, never throws.
 */

export type Intent =
  | 'overview'
  | 'accounts'
  | 'credit'
  | 'transactions'
  | 'bills'
  | 'loans'
  | 'recurring'
  | 'spending'
  | 'cashflow'
  | 'rewards'
  | 'anomalies'
  | 'locations'
  | 'goal'
  | 'customer'
  | 'merchants'
  | 'climate';

const INTENT_KEYWORDS: ReadonlyArray<readonly [Intent, readonly string[]]> = [
  ['overview', ['overview', 'snapshot', 'summary', 'finances', 'financial picture', 'everything', 'how am i doing', 'net worth']],
  ['accounts', ['account', 'accounts', 'balance', 'checking', 'savings']],
  ['credit', ['credit card', 'card', 'cards', 'available credit']],
  ['transactions', ['transaction', 'transactions', 'activity', 'purchase', 'purchases', 'deposit', 'deposits', 'withdrawal', 'withdrawals', 'recent', 'history']],
  ['bills', ['bill', 'bills', 'due', 'upcoming', 'rent', 'utility', 'utilities']],
  ['loans', ['loan', 'loans', 'mortgage', 'auto loan', 'student loan', 'debt']],
  ['recurring', ['recurring', 'subscription', 'subscriptions', 'repeating', 'monthly charge']],
  ['spending', ['spending', 'spent', 'expense', 'expenses', 'grocery', 'groceries', 'where did my money go', 'category', 'categories', 'budget']],
  ['cashflow', ['cashflow', 'cash flow', 'income', 'inflow', 'outflow', 'net cash', 'paycheck']],
  ['rewards', ['reward', 'rewards', 'points', 'miles', 'cash back', 'cashback']],
  ['anomalies', ['weird', 'unusual', 'duplicate', 'anomaly', 'anomalies', 'suspicious']],
  ['locations', ['atm', 'atms', 'branch', 'branches', 'near me', 'location', 'locations']],
  ['goal', ['goal', 'save for', 'saving for', 'target']],
  ['customer', ['profile', 'who am i', 'address', 'account holder']],
  ['merchants', ['merchant', 'merchants', 'shop most', 'where do i shop', 'top merchant', 'favorite merchant', 'most frequent merchant']],
  ['climate', ['climatewise', 'climate', 'lorax', 'carbon', 'emissions', 'emission', 'footprint', 'co2']]
];

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function mentions(text: string, keyword: string): boolean {
  if (keyword.includes(' ')) return text.includes(keyword);
  return new RegExp(`\\b${escapeRegExp(keyword)}\\b`).test(text);
}

/** Classify a user prompt into every intent its wording mentions. */
export function classifyIntents(prompt: string): Set<Intent> {
  const text = String(prompt ?? '').toLowerCase();
  const intents = new Set<Intent>();
  if (!text.trim()) return intents;

  for (const [intent, keywords] of INTENT_KEYWORDS) {
    if (keywords.some((keyword) => mentions(text, keyword))) intents.add(intent);
  }
  return intents;
}

/**
 * True when the prompt ranks purchases by their emissions, e.g. "Show my top
 * emitting purchases". The chat renders those rows as a transaction list
 * instead of repeating the full ClimateWise report card. Pure and case-safe.
 */
export function wantsTopEmittingPurchases(prompt: string): boolean {
  const text = String(prompt ?? '').toLowerCase();
  if (!text.trim()) return false;
  return /\b(?:top|biggest|highest|most)\b[^.!?\n]*(?:emitting|emissions?|carbon|co2|co₂|footprint)[^.!?\n]*\b(?:purchases?|transactions?|spend(?:ing)?)\b/.test(
    text
  );
}
