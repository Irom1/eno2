/**
 * High-level, non-technical thinking steps shown while Eno is working.
 * Pure functions only: no DOM or server imports.
 */

export const THINKING_START = 'Understanding your question';
/** Shown once cards are on screen but the prose has not arrived yet. */
export const THINKING_COMPOSING = 'Putting your answer together…';

export interface ThinkingState {
  /** Completed steps, oldest first (at most three). */
  steps: string[];
  /** The step currently in progress. */
  current: string;
}

export function initialThinking(): ThinkingState {
  return { steps: [], current: THINKING_START };
}

interface Rule {
  readonly match: readonly string[];
  readonly label: string;
}

/**
 * Ordered substring rules. Earlier rules win, so specific families (bills,
 * loans, locations) are classified before broader ones (accounts, overview).
 */
const RULES: readonly Rule[] = [
  { match: ['atm', 'branch', 'nearby'], label: 'Finding nearby locations' },
  { match: ['loan'], label: 'Checking your loans' },
  { match: ['bill'], label: 'Checking upcoming bills' },
  { match: ['recurring', 'subscription'], label: 'Finding recurring payments' },
  { match: ['anomal'], label: 'Scanning for unusual activity' },
  { match: ['spend'], label: 'Reviewing your spending' },
  { match: ['reward'], label: 'Checking your rewards' },
  { match: ['goal'], label: 'Projecting your savings goal' },
  { match: ['merchant'], label: 'Looking at where you shop' },
  { match: ['cashflow', 'cash_flow'], label: 'Reviewing your cash flow' },
  {
    match: ['deposit', 'withdraw', 'transaction', 'purchase', 'transfer'],
    label: 'Reviewing recent transactions'
  },
  { match: ['account'], label: 'Reviewing your accounts' },
  { match: ['customer', 'profile', 'list_customers'], label: 'Confirming your details' },
  { match: ['overview'], label: 'Reviewing your finances' }
];

/** Whether a server-provided label is safe to show to a customer. */
function usableFallback(fallback: string): boolean {
  const value = fallback.trim();
  if (!value) return false;
  if (value.includes('_')) return false;
  if (/nessie/i.test(value)) return false;
  if (/insight/i.test(value)) return false;
  return true;
}

/** Friendly, non-technical label for a tool name. `fallback` is the server's label. */
export function friendlyToolLabel(name: string, fallback = ''): string {
  const value = String(name ?? '').toLowerCase();
  for (const rule of RULES) {
    if (rule.match.some((keyword) => value.includes(keyword))) return rule.label;
  }
  if (usableFallback(fallback)) return fallback.trim();
  return 'Looking that up';
}

/**
 * Append the previous current step to history (deduped and capped at three) and
 * set a new current step. Empty or consecutive duplicate labels keep the state
 * unchanged.
 */
export function pushThinkingStep(state: ThinkingState, next: string): ThinkingState {
  const label = String(next ?? '').trim();
  if (!label || label === state.current) return state;
  return {
    steps: [...state.steps, state.current].filter(Boolean).slice(-3),
    current: label
  };
}
