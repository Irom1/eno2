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
  | 'merchants';

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
  ['merchants', ['merchant', 'merchants']]
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
