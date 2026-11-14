/**
 * Client-safe suggested follow-ups: one-click prompts relevant to the entity
 * cards that were just shown (or, when there are no cards, to the asked
 * question). Pure functions, no server imports, never throws.
 */
import type { EntityCard } from './entityCards.js';
import { classifyIntents, type Intent } from './intents.js';

/** Topics the suggestion matrix is keyed by. */
type Topic =
  | 'loans'
  | 'bills'
  | 'transactions'
  | 'spending'
  | 'cashflow'
  | 'anomalies'
  | 'rewards'
  | 'accounts'
  | 'recurring'
  | 'overview'
  | 'locations'
  | 'customer'
  | 'goal'
  | 'merchants';

const SUGGESTIONS: Readonly<Record<Topic, readonly string[]>> = {
  loans: [
    'Show me my bills',
    'Show my recent transactions',
    "What's due in the next 30 days?",
    'Show my account balances'
  ],
  bills: [
    'Show me my loans',
    'Show my recent transactions',
    'Where did my money go last month?',
    'Show my account balances'
  ],
  transactions: [
    'Anything unusual in my transactions?',
    'Show my bills',
    'Where did my money go last month?',
    'Show my account balances'
  ],
  spending: [
    'Show my recent transactions',
    'Show my bills',
    'Show my account balances',
    'Anything unusual in my transactions?'
  ],
  cashflow: [
    'Show my spending',
    'Show my bills',
    'Show my recent transactions',
    'Show my account balances'
  ],
  anomalies: [
    'Show my recent transactions',
    'Show my bills',
    'Show my spending',
    'Show my account balances'
  ],
  rewards: [
    'Show my spending',
    'Show my bills',
    'Show my recent transactions',
    'Show my account balances'
  ],
  accounts: [
    'Show my recent transactions',
    "What's due in the next 30 days?",
    'Where did my money go last month?',
    'Show my rewards'
  ],
  recurring: [
    'Show my bills',
    'Show my recent transactions',
    'Show my spending',
    'Show my account balances'
  ],
  overview: [
    'Show my spending',
    "What's due in the next 30 days?",
    'Show my recent transactions',
    'Show my rewards'
  ],
  locations: [
    'Show my accounts',
    "What's due in the next 30 days?",
    'Show my spending',
    'Show my recent transactions'
  ],
  customer: [
    'Show my accounts',
    "What's due in the next 30 days?",
    'Show my spending',
    'Show my rewards'
  ],
  goal: [
    'Show my accounts',
    'Show my spending',
    "What's due in the next 30 days?"
  ],
  merchants: [
    'Show my recent transactions',
    'Where did my money go last month?',
    'Show my accounts'
  ]
};

const FALLBACK: readonly string[] = [
  'Show my accounts',
  "What's due in the next 30 days?",
  'Where did my money go last month?',
  'Show my rewards'
];

/** Specific cards come first when several kinds are on screen. */
const PRIORITY: readonly Topic[] = [
  'loans',
  'bills',
  'transactions',
  'spending',
  'cashflow',
  'anomalies',
  'rewards',
  'accounts',
  'recurring',
  'overview',
  'locations',
  'customer',
  'goal',
  'merchants'
];

const KIND_TOPIC: Readonly<Record<EntityCard['kind'], Topic>> = {
  transaction: 'transactions',
  'transaction-list': 'transactions',
  bill: 'bills',
  account: 'accounts',
  loan: 'loans',
  'spending-pie': 'spending',
  recurring: 'recurring',
  reward: 'rewards',
  location: 'locations',
  goal: 'goal',
  cashflow: 'cashflow',
  merchant: 'merchants',
  profile: 'customer'
};

const INTENT_TOPIC: Readonly<Record<Intent, Topic>> = {
  overview: 'overview',
  accounts: 'accounts',
  credit: 'rewards',
  transactions: 'transactions',
  bills: 'bills',
  loans: 'loans',
  recurring: 'recurring',
  spending: 'spending',
  cashflow: 'cashflow',
  rewards: 'rewards',
  anomalies: 'anomalies',
  locations: 'locations',
  goal: 'goal',
  customer: 'customer',
  merchants: 'merchants'
};

const MAX = 4;
const MIN = 3;

const normalize = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

/** Resolve the suggestion topic for a rendered entity card. */
function topicForCard(card: EntityCard | null | undefined): Topic | undefined {
  if (!card || typeof card !== 'object') return undefined;
  return KIND_TOPIC[card.kind];
}

/**
 * 3-4 natural one-click follow-ups for the cards just rendered, excluding the
 * exact question that was just asked. Falls back to intent wording, then to a
 * generic banking set. Never throws and never repeats a prompt.
 */
export function followUpsFor(cards: EntityCard[], prompt: string): string[] {
  const asked = normalize(prompt);
  const topics = new Set<Topic>();

  const list = Array.isArray(cards) ? cards : [];
  for (const card of list) {
    const topic = topicForCard(card);
    if (topic) topics.add(topic);
  }

  // Nothing recognisable on screen: fall back to what the user asked about.
  if (topics.size === 0) {
    for (const intent of classifyIntents(String(prompt ?? ''))) {
      const topic = INTENT_TOPIC[intent];
      if (topic) topics.add(topic);
    }
  }

  const ordered = PRIORITY.filter((topic) => topics.has(topic));

  const seen = new Set<string>();
  const result: string[] = [];

  function add(suggestion: string): boolean {
    const key = normalize(suggestion);
    if (!key || key === asked || seen.has(key)) return false;
    seen.add(key);
    result.push(suggestion);
    return result.length >= MAX;
  }

  function addAll(suggestions: readonly string[]): boolean {
    for (const suggestion of suggestions) {
      if (add(suggestion)) return true;
    }
    return false;
  }

  for (const topic of ordered) {
    if (addAll(SUGGESTIONS[topic])) break;
  }

  if (result.length === 0) {
    addAll(FALLBACK);
  } else if (result.length < MIN) {
    addAll(FALLBACK);
  }

  return result.slice(0, MAX);
}
