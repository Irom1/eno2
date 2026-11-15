/**
 * Client-safe suggested follow-ups: one-click prompts composed from the entity
 * cards that were just shown, the assistant's answer text (including any
 * clarification question), the asked prompt, and the loaded accounts. The
 * static topic matrix below is only a fallback/fill. Pure functions, no server
 * imports, never throws.
 */
import type { EntityCard } from './entityCards.js';
import { classifyIntents, type Intent } from './intents.js';
import { isRecord } from './payloads.js';

/** Minimal account context used to answer "which account?" clarifications. */
export interface FollowUpAccount {
  id?: string;
  nickname?: string;
  type?: string;
}

/** Topics the static suggestion matrix is keyed by. */
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
  | 'merchants'
  | 'climatewise';

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
  ],
  climatewise: [
    'Show my top emitting purchases',
    'Where did my emissions come from?',
    'Show my spending',
    'Show my account balances'
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
  'merchants',
  'climatewise'
];

const KIND_TOPIC: Readonly<Record<EntityCard['kind'], Topic>> = {
  transaction: 'transactions',
  'transaction-list': 'transactions',
  bill: 'bills',
  'bill-list': 'bills',
  account: 'accounts',
  loan: 'loans',
  'spending-pie': 'spending',
  recurring: 'recurring',
  reward: 'rewards',
  location: 'locations',
  goal: 'goal',
  cashflow: 'cashflow',
  merchant: 'merchants',
  profile: 'customer',
  climatewise: 'climatewise'
};

/** Single-entity cards are more specific than aggregate/period cards. */
const CARD_PRIORITY: readonly EntityCard['kind'][] = [
  'transaction',
  'transaction-list',
  'bill',
  'bill-list',
  'loan',
  'account',
  'spending-pie',
  'recurring',
  'reward',
  'location',
  'goal',
  'cashflow',
  'merchant',
  'profile',
  'climatewise'
];

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
  merchants: 'merchants',
  climate: 'climatewise'
};

const MAX = 4;
const MIN = 3;

const normalize = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

function textField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** Safely read the most human-meaningful label out of a rendered card. */
function labelForCard(card: EntityCard | null | undefined): string {
  if (!card || typeof card !== 'object') return '';
  const payload: Record<string, unknown> = isRecord(card.payload) ? card.payload : {};

  switch (card.kind) {
    case 'transaction':
      return textField(payload, 'description');
    case 'transaction-list': {
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      const first = rows[0];
      return isRecord(first) ? textField(first, 'description') : '';
    }
    case 'bill':
      return textField(payload, 'payee');
    case 'bill-list': {
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      const first = rows[0];
      return isRecord(first) ? textField(first, 'payee') : '';
    }
    case 'loan':
      return textField(payload, 'type');
    case 'account':
      return textField(payload, 'nickname') || textField(payload, 'type');
    case 'spending-pie': {
      const slices = Array.isArray(payload.slices) ? payload.slices : [];
      const first = slices[0];
      return isRecord(first) ? textField(first, 'label') : '';
    }
    case 'recurring':
      return textField(payload, 'description');
    case 'reward':
      return textField(payload, 'label');
    case 'location':
      return textField(payload, 'name');
    case 'goal':
      return textField(payload, 'label');
    case 'merchant':
      return textField(payload, 'name');
    case 'profile':
      return textField(payload, 'name');
    case 'climatewise':
      return textField(payload, 'topCategory');
    default:
      return '';
  }
}

/** Follow-up wording wants "grocery", not the plural category label. */
function categoryLabel(label: string): string {
  const text = label.trim();
  return text.toLowerCase() === 'groceries' ? 'grocery' : text;
}

function locationType(card: EntityCard | null | undefined): string {
  if (!card || typeof card !== 'object' || !isRecord(card.payload)) return '';
  return textField(card.payload, 'type').toLowerCase();
}

/** Composed prompts for one card, most specific template first. */
function dynamicCandidates(card: EntityCard | null | undefined): string[] {
  if (!card || typeof card !== 'object') return [];
  const label = labelForCard(card);
  const out: string[] = [];

  switch (card.kind) {
    case 'transaction':
    case 'transaction-list':
      if (label) out.push(`Show my transactions at ${label}`);
      out.push('Anything unusual in my transactions?', 'Where did my money go last month?');
      break;
    case 'bill':
    case 'bill-list':
      if (label) out.push(`Can I cover my ${label} bill?`);
      out.push('Show me my loans', 'Show my checking balance');
      break;
    case 'loan':
      if (label) out.push(`Show my ${label} details`);
      out.push('Show me my bills', 'Show my recent transactions', 'Show my account balances');
      break;
    case 'account':
      if (label) out.push(`Show my ${label} transactions`);
      out.push('Show my rewards', "What's due in the next 30 days?");
      break;
    case 'spending-pie':
      if (label) out.push(`Show my ${categoryLabel(label)} transactions`);
      out.push('Compare this month to last month', 'Where can I cut back?', 'Show my bills');
      break;
    case 'recurring':
      if (label) out.push(`Is my ${label} subscription still active?`);
      out.push('Show my subscriptions', 'Show my bills');
      break;
    case 'reward':
      out.push('Show my credit card spending', 'Show my rewards', 'Show my accounts');
      break;
    case 'location': {
      const type = locationType(card);
      if (type === 'atm') out.push('Find another ATM near Arlington, VA');
      else if (type === 'branch') out.push('Find another branch near Arlington');
      out.push('Show my recent transactions', 'Show my accounts');
      break;
    }
    case 'goal':
      out.push('How can I reach my goal faster?', 'Show my accounts', 'Show my spending');
      break;
    case 'cashflow':
      out.push('Show my spending', 'Show my bills', 'Show my recent transactions');
      break;
    case 'merchant':
      if (label) out.push(`Show my transactions at ${label}`);
      out.push(
        'Where do I shop most?',
        'Show my spending by category',
        'Show my recent transactions'
      );
      break;
    case 'profile':
      out.push('Show my accounts', 'Show my rewards', "What's due in the next 30 days?");
      break;
    case 'climatewise':
      if (label) out.push(`How can I lower my ${categoryLabel(label)} emissions?`);
      out.push(
        'Show my top emitting purchases',
        'Where did my emissions come from?',
        'Show my spending'
      );
      break;
    default:
      break;
  }

  return out;
}

/** True when the assistant prose reads like a question that needs an answer. */
function looksLikeQuestion(text: string): boolean {
  const value = String(text ?? '').trim();
  if (!value) return false;
  if (value.includes('?')) return true;
  return /\b(?:which|what|would you like|do you want|shall i|should i|how|where|when|who|can i|could you|are you|is there|did you)\b/i.test(
    value
  );
}

function uniqueLabels(labels: readonly string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const label of labels) {
    const text = typeof label === 'string' ? label.trim() : '';
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

/** Account labels are safe to repeat only while unique. */
function accountLabels(accounts: readonly FollowUpAccount[]): string[] {
  const labels: string[] = [];
  for (const account of accounts) {
    if (!account || typeof account !== 'object') continue;
    const nickname = typeof account.nickname === 'string' ? account.nickname.trim() : '';
    const type = typeof account.type === 'string' ? account.type.trim() : '';
    labels.push(nickname || type);
  }
  return uniqueLabels(labels, 3);
}

/** Top spending categories from the first pie card on screen. */
function pieCategories(cards: readonly EntityCard[]): string[] {
  for (const card of cards) {
    if (!card || typeof card !== 'object' || card.kind !== 'spending-pie') continue;
    const slices = isRecord(card.payload) && Array.isArray(card.payload.slices)
      ? card.payload.slices
      : [];
    const labels = slices
      .filter(isRecord)
      .map((slice) => (typeof slice.label === 'string' ? slice.label : ''));
    return uniqueLabels(labels, 3);
  }
  return [];
}

/** Merchant-like labels from transaction and merchant cards on screen. */
function merchantLabels(cards: readonly EntityCard[]): string[] {
  const labels: string[] = [];
  for (const card of cards) {
    if (!card || typeof card !== 'object') continue;
    if (card.kind !== 'transaction' && card.kind !== 'merchant') continue;
    const label = labelForCard(card);
    if (label) labels.push(label);
  }
  return uniqueLabels(labels, 3);
}

/**
 * One-click answers to a clarification question the assistant just asked.
 * Specific question shapes win; the yes/no trio is only used when nothing more
 * specific matched, so "which account?" never offers a bare "Yes".
 */
function clarificationOptions(
  assistantText: string,
  cards: readonly EntityCard[],
  accounts: readonly FollowUpAccount[]
): string[] {
  if (!looksLikeQuestion(assistantText)) return [];
  const text = String(assistantText ?? '');
  const out: string[] = [];

  if (
    /which (?:account|card)|what (?:account|card)|account would you like|card would you like/i.test(
      text
    )
  ) {
    const labels = accountLabels(accounts);
    if (labels.length > 0) {
      for (const label of labels) out.push(`Show my ${label} transactions`);
    } else {
      out.push(
        'Show my checking transactions',
        'Show my savings transactions',
        'Show my credit card transactions'
      );
    }
  }

  if (/which (?:category|type)|what (?:category|type)/i.test(text)) {
    const labels = pieCategories(cards);
    if (labels.length > 0) {
      for (const label of labels) out.push(`Show my ${categoryLabel(label)} transactions`);
    } else {
      out.push(
        'Show my housing spending',
        'Show my grocery spending',
        'Show my dining spending'
      );
    }
  }

  if (/which (?:month|period)|what (?:month|period)/i.test(text)) {
    out.push(
      "Show last month's spending",
      "Show this month's spending",
      'Show the last 3 months of spending'
    );
  }

  if (/target|goal amount|how much.*(?:save|goal)|what amount/i.test(text)) {
    out.push(
      'How long to save $1,000?',
      'How long to save $2,500?',
      'How long to save $5,000?'
    );
  }

  if (
    /which (?:transaction|charge|merchant)|what (?:transaction|charge|merchant)/i.test(text)
  ) {
    const labels = merchantLabels(cards);
    for (const label of labels) out.push(`Show my transactions at ${label}`);
  }

  if (
    out.length === 0 &&
    /would you like|do you want|shall i|should i/i.test(text)
  ) {
    out.push(
      'Yes, show me the details',
      'No, not right now',
      'Show my recent transactions'
    );
  }

  return out;
}

/** Stable order: single-entity cards first, then aggregates, then periods. */
function orderCards(cards: readonly EntityCard[]): EntityCard[] {
  const rank = new Map<EntityCard['kind'], number>();
  CARD_PRIORITY.forEach((kind, index) => rank.set(kind, index));
  return [...cards].sort((a, b) => {
    const aRank = a && typeof a === 'object' ? (rank.get(a.kind) ?? 999) : 999;
    const bRank = b && typeof b === 'object' ? (rank.get(b.kind) ?? 999) : 999;
    return aRank - bRank;
  });
}

/**
 * 3-4 natural one-click follow-ups for the turn just rendered. Ordering is:
 * clarification answers, dynamic prompts from the actual card payloads, then
 * the static topic matrix to fill. The asked prompt is never repeated and the
 * result never contains duplicates. Never throws.
 */
export function followUpsFor(
  cards: EntityCard[],
  prompt: string,
  assistantText = '',
  accounts: readonly FollowUpAccount[] = []
): string[] {
  const asked = normalize(prompt);

  try {
    const list = Array.isArray(cards) ? cards.filter(Boolean) : [];
    const safeAccounts = Array.isArray(accounts) ? accounts : [];

    const seen = new Set<string>();
    const result: string[] = [];

    function add(suggestion: unknown): boolean {
      const text = typeof suggestion === 'string' ? suggestion.trim() : '';
      const key = normalize(text);
      if (!key || key === asked || seen.has(key)) return false;
      seen.add(key);
      result.push(text);
      return result.length >= MAX;
    }

    function addAll(suggestions: readonly string[]): boolean {
      for (const suggestion of suggestions) {
        if (add(suggestion)) return true;
      }
      return false;
    }

    // 1. Clarification answers come first so they read as direct replies.
    addAll(clarificationOptions(assistantText, list, safeAccounts));

    // 2. Prompts composed from the actual rendered cards.
    const topics = new Set<Topic>();
    for (const card of orderCards(list)) {
      if (result.length >= MAX) break;
      addAll(dynamicCandidates(card));
      const topic = KIND_TOPIC[card.kind];
      if (topic) topics.add(topic);
    }

    // 3. Static fill from the card topics (or prompt intents when no cards).
    if (result.length < MAX) {
      if (topics.size === 0) {
        for (const intent of classifyIntents(String(prompt ?? ''))) {
          const topic = INTENT_TOPIC[intent];
          if (topic) topics.add(topic);
        }
      }
      const ordered = PRIORITY.filter((topic) => topics.has(topic));
      for (const topic of ordered) {
        if (addAll(SUGGESTIONS[topic])) break;
      }
    }

    // 4. Generic fill only when nothing more specific produced a suggestion.
    if (result.length === 0) {
      addAll(FALLBACK);
    } else if (result.length < MIN) {
      addAll(FALLBACK);
    }

    return result.slice(0, MAX);
  } catch {
    // Defensive: malformed cards or accounts must never break the chat UI.
    return FALLBACK.filter((suggestion) => normalize(suggestion) !== asked).slice(0, MAX);
  }
}
