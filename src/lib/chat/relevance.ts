/**
 * Client-safe relevance filtering: keep only the cards a question needs.
 * Pure functions, no server imports.
 */
import type { ChatCard, ChatCardKind } from './cards.js';
import { asItems, asRecord } from './cards.js';

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
  ['transactions', ['transaction', 'transactions', 'activity', 'purchase', 'deposit', 'withdrawal', 'recent', 'history']],
  ['bills', ['bill', 'bills', 'due', 'upcoming', 'rent', 'utility', 'utilities']],
  ['loans', ['loan', 'loans', 'mortgage', 'auto loan', 'student loan', 'debt']],
  ['recurring', ['recurring', 'subscription', 'subscriptions', 'repeating', 'monthly charge']],
  ['spending', ['spending', 'spent', 'where did my money go', 'category', 'categories', 'budget']],
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

/**
 * True when the customer is asking specifically about credit cards, without
 * also asking for all accounts or an overview. Such answers should list only
 * credit-card accounts.
 */
export function isCreditOnlyPrompt(prompt: string): boolean {
  const intents = classifyIntents(prompt);
  return intents.has('credit') && !intents.has('accounts') && !intents.has('overview');
}

const OVERVIEW_GROUP: ReadonlySet<ChatCardKind> = new Set([
  'overview',
  'accounts',
  'rewards',
  'cashflow'
]);

/** Map intents to the card kinds that may render. Empty means "do not filter". */
export function allowedKindsFor(intents: Set<Intent>): Set<ChatCardKind> {
  const kinds = new Set<ChatCardKind>();
  for (const intent of intents) {
    switch (intent) {
      case 'overview':
        for (const kind of OVERVIEW_GROUP) kinds.add(kind);
        break;
      case 'accounts':
        kinds.add('accounts');
        kinds.add('account');
        break;
      case 'credit':
        kinds.add('accounts');
        kinds.add('account');
        kinds.add('rewards');
        break;
      case 'transactions':
        kinds.add('transactions');
        kinds.add('transaction');
        break;
      case 'bills':
        kinds.add('bills');
        break;
      case 'loans':
        kinds.add('loans');
        break;
      case 'recurring':
        kinds.add('recurring');
        break;
      case 'spending':
        kinds.add('spending');
        break;
      case 'cashflow':
        kinds.add('cashflow');
        break;
      case 'rewards':
        kinds.add('rewards');
        kinds.add('account');
        kinds.add('accounts');
        break;
      case 'anomalies':
        kinds.add('anomalies');
        break;
      case 'locations':
        kinds.add('locations');
        break;
      case 'goal':
        kinds.add('goal');
        break;
      case 'customer':
        kinds.add('customer');
        break;
      case 'merchants':
        kinds.add('merchants');
        break;
      default:
        break;
    }
  }
  return kinds;
}

const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const arrayOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const meaningfulRecord = (value: unknown): boolean => {
  const record = asRecord(value);
  return Object.keys(record).some(
    (key) => key !== 'count' && key !== 'truncated' && key !== 'message'
  );
};

function hasCashflow(value: unknown): boolean {
  if (arrayOf(value).length > 0) return true;
  const data = asRecord(value);
  if (arrayOf(data.monthlyCashflow).length > 0) return true;
  const summary = asRecord(data.cashflow90Days);
  return ['inflow', 'outflow', 'net'].some((key) => key in summary);
}

function recurringRows(payload: unknown): unknown[] {
  const data = asRecord(payload);
  return Array.isArray(data.recurringCharges) ? data.recurringCharges : asItems(payload);
}

/** Whether a card has nothing meaningful to show. */
export function isCardEmpty(card: ChatCard): boolean {
  const data = asRecord(card.payload);

  switch (card.kind) {
    case 'overview': {
      const accounts = arrayOf(data.accounts);
      const totals = [
        num(data.liquidTotal),
        num(data.cardBalances),
        num(data.totalRewards),
        num(asRecord(data.upcomingBills).total),
        num(asRecord(data.loanObligations).monthlyPayment)
      ];
      return (
        accounts.length === 0 &&
        !hasCashflow(data.monthlyCashflow) &&
        totals.every((total) => total === 0)
      );
    }
    case 'account':
    case 'transaction':
    case 'customer':
      return asItems(card.payload).length === 0 && !meaningfulRecord(card.payload);
    case 'transactions':
      return asItems(card.payload).length === 0;
    case 'bills':
    case 'accounts':
    case 'locations':
    case 'merchants':
      return asItems(card.payload).length === 0;
    case 'loans': {
      if (asItems(card.payload).length > 0) return false;
      return num(data.count) === 0 && num(data.monthlyPayment) === 0;
    }
    case 'recurring':
      return recurringRows(card.payload).length === 0;
    case 'spending':
      return arrayOf(data.categories).length === 0;
    case 'cashflow':
      return !hasCashflow(card.payload);
    case 'anomalies':
      return arrayOf(data.findings).length === 0;
    case 'rewards': {
      if (typeof card.payload === 'number') return num(card.payload) === 0;
      const accounts = arrayOf(data.accounts).map(asRecord);
      return (
        num(data.totalRewards) === 0 &&
        !accounts.some((account) => num(account.rewards) > 0)
      );
    }
    case 'goal':
      return num(data.targetAmount) === 0;
    case 'unknown':
      return !meaningfulRecord(card.payload);
    default:
      return false;
  }
}

function isRelevant(card: ChatCard, allowed: Set<ChatCardKind>): boolean {
  if (allowed.size === 0) return true;
  if (card.kind === 'overview') {
    return [...OVERVIEW_GROUP].some((kind) => allowed.has(kind));
  }
  return allowed.has(card.kind);
}

/**
 * Keep only relevant, non-redundant cards. If every card of a kind is empty we
 * keep one so the UI can still say "No loans to show".
 */
export function visibleCards(cards: ChatCard[], prompt: string): ChatCard[] {
  const allowed = allowedKindsFor(classifyIntents(prompt));
  const relevant = cards.filter((card) => isRelevant(card, allowed));

  const hasNonEmpty = new Set<ChatCardKind>();
  for (const card of relevant) {
    if (!isCardEmpty(card)) hasNonEmpty.add(card.kind);
  }

  const kept: ChatCard[] = [];
  const emptyKept = new Set<ChatCardKind>();
  const seen = new Set<string>();

  for (const card of relevant) {
    const empty = isCardEmpty(card);
    if (empty && hasNonEmpty.has(card.kind)) continue;
    if (empty) {
      if (emptyKept.has(card.kind)) continue;
      emptyKept.add(card.kind);
    }

    const fingerprint = `${card.kind}:${JSON.stringify(card.payload)}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    kept.push(card);
  }

  return kept;
}
