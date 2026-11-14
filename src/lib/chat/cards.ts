/**
 * Client-safe registry that maps a tool name to an inline chat card kind.
 * Pure functions only: no server imports, safe to bundle in the browser.
 */

export type ChatCardKind =
  | 'overview'
  | 'accounts'
  | 'account'
  | 'transactions'
  | 'transaction'
  | 'bills'
  | 'loans'
  | 'recurring'
  | 'spending'
  | 'cashflow'
  | 'anomalies'
  | 'rewards'
  | 'locations'
  | 'goal'
  | 'customer'
  | 'merchants'
  | 'unknown';

export interface ChatCard {
  id: number;
  kind: ChatCardKind;
  tool: string;
  payload: unknown;
}

/** Every kind a card can render, excluding the unknown fallback. */
export const CHAT_CARD_KINDS: ChatCardKind[] = [
  'overview',
  'accounts',
  'account',
  'transactions',
  'transaction',
  'bills',
  'loans',
  'recurring',
  'spending',
  'cashflow',
  'anomalies',
  'rewards',
  'locations',
  'goal',
  'customer',
  'merchants'
];

/** Alias kept for callers that prefer the short name. */
export const CARD_KINDS: ChatCardKind[] = CHAT_CARD_KINDS;

const TOOL_KIND: Readonly<Record<string, ChatCardKind>> = Object.freeze({
  // Deterministic insight tools
  insight_financial_overview: 'overview',
  insight_spending_breakdown: 'spending',
  insight_upcoming_bills: 'bills',
  insight_recurring_charges: 'recurring',
  insight_anomalies: 'anomalies',
  insight_goal_projection: 'goal',
  find_nearby_atms: 'locations',
  find_nearby_branches: 'locations',

  // Customers
  nessie_list_customers: 'customer',
  nessie_get_customer: 'customer',
  nessie_get_account_customer: 'customer',

  // Accounts
  nessie_list_customer_accounts: 'accounts',
  nessie_get_account: 'account',

  // Bills
  nessie_list_customer_bills: 'bills',
  nessie_list_account_bills: 'bills',
  nessie_get_bill: 'bills',

  // Transactions
  nessie_list_account_deposits: 'transactions',
  nessie_list_account_withdrawals: 'transactions',
  nessie_get_deposit: 'transaction',
  nessie_get_withdrawal: 'transaction',
  nessie_get_purchase: 'transaction',
  nessie_get_transfer: 'transaction',

  // Loans
  nessie_list_account_loans: 'loans',
  nessie_get_loan: 'loans',

  // Merchants
  nessie_list_merchants: 'merchants',
  nessie_get_merchant: 'merchants',

  // Locations
  nessie_list_atms: 'locations',
  nessie_get_atm: 'locations',
  nessie_list_branches: 'locations',
  nessie_get_branch: 'locations'
});

/** Resolve the card kind for any tool name; unknown tools fall back safely. */
export function chatCardKind(tool: string): ChatCardKind {
  return TOOL_KIND[tool] ?? 'unknown';
}

const LABELS: Readonly<Record<ChatCardKind, string>> = Object.freeze({
  overview: 'Overview',
  accounts: 'Accounts',
  account: 'Account',
  transactions: 'Transactions',
  transaction: 'Transaction',
  bills: 'Bills',
  loans: 'Loans',
  recurring: 'Recurring payments',
  spending: 'Spending',
  cashflow: 'Cashflow',
  anomalies: 'Worth a look',
  rewards: 'Rewards',
  locations: 'Nearby',
  goal: 'Goal',
  customer: 'Account holder',
  merchants: 'Merchants',
  unknown: 'Details'
});

/** Product-language header for a card kind. */
export function cardLabel(kind: ChatCardKind): string {
  return LABELS[kind] ?? LABELS.unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const LIST_KEYS = ['items', 'results', 'bills', 'accounts'] as const;

/**
 * Pull row objects out of the common tool payload shapes. Handles arrays,
 * `{items}`, `{results}`, `{bills}`, `{accounts}`, and a single record.
 * Wrapper-only payloads (count/message with no list) resolve to an empty list.
 */
export function asItems(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];

  for (const key of LIST_KEYS) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }

  if ('count' in payload || 'truncated' in payload || 'message' in payload) return [];
  return [payload];
}

/** Coerce any payload into an object without throwing. */
export function asRecord(payload: unknown): Record<string, unknown> {
  return isRecord(payload) ? payload : {};
}

/** Deposit-backed tools are positive; withdrawals, purchases and transfers are not. */
export function transactionKind(tool: string): 'deposit' | 'withdrawal' {
  return tool === 'nessie_list_account_deposits' || tool === 'nessie_get_deposit'
    ? 'deposit'
    : 'withdrawal';
}
