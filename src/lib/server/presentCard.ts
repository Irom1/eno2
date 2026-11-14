/**
 * Server-side candidate collection and ownership validation for the read-only
 * `present_card` tool.
 *
 * Candidates come from tool results in the same turn. The model never fetches
 * through `present_card`; it only declares an entity that a data tool already
 * returned. Raw records never leave this module: only whitelisted,
 * client-safe `EntityCard` payloads are returned.
 */
import { asItems } from '$lib/chat/cards.js';
import {
  accountCard,
  billCard,
  loanCard,
  locationCard,
  merchantCard,
  profileCard,
  transactionCard,
  type EntityCard
} from '$lib/chat/entityCards.js';
import type { Session } from './session';

export type CardKind =
  | 'account'
  | 'bill'
  | 'loan'
  | 'transaction'
  | 'merchant'
  | 'location'
  | 'profile';

export interface CardCandidate {
  kind: CardKind;
  id: string;
  /** Owning account, used for mandatory ownership validation. */
  accountId?: string;
  record: Record<string, unknown>;
}

const ACCOUNT_TOOLS = new Set(['nessie_list_customer_accounts', 'nessie_get_account']);

const BILL_TOOLS = new Set([
  'insight_upcoming_bills',
  'nessie_list_customer_bills',
  'nessie_list_account_bills',
  'nessie_get_bill'
]);

const LOAN_TOOLS = new Set(['nessie_list_account_loans', 'nessie_get_loan']);

const TRANSACTION_TOOLS = new Set([
  'nessie_list_account_deposits',
  'nessie_get_deposit',
  'nessie_list_account_withdrawals',
  'nessie_get_withdrawal',
  'nessie_get_purchase',
  'nessie_get_transfer'
]);

const MERCHANT_TOOLS = new Set(['nessie_list_merchants', 'nessie_get_merchant']);

const LOCATION_TOOLS = new Set([
  'find_nearby_atms',
  'find_nearby_branches',
  'nessie_list_atms',
  'nessie_get_atm',
  'nessie_list_branches',
  'nessie_get_branch'
]);

const PROFILE_TOOLS = new Set(['nessie_get_customer', 'nessie_get_account_customer']);

const CARD_KINDS: ReadonlySet<string> = new Set<CardKind>([
  'account',
  'bill',
  'loan',
  'transaction',
  'merchant',
  'location',
  'profile'
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function idOf(row: Record<string, unknown>): string {
  const raw = row._id ?? row.id;
  if (typeof raw === 'string' || typeof raw === 'number') {
    const text = String(raw).trim();
    if (text.length > 0) return text;
  }
  return '';
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function firstFinite(...values: unknown[]): number | null {
  for (const value of values) {
    const amount = finiteOrNull(value);
    if (amount !== null) return amount;
  }
  return null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = str(value);
    if (text.length > 0) return text;
  }
  return '';
}

function isCardKind(value: string): value is CardKind {
  return CARD_KINDS.has(value);
}

function billRecord(row: Record<string, unknown>, id: string, accountId: string): Record<string, unknown> {
  return {
    ...row,
    billId: id,
    amount: firstFinite(row.amount, row.paymentAmount, row.payment_amount),
    dueDate: firstString(
      row.dueDate,
      row.due_date,
      row.upcomingPaymentDate,
      row.upcoming_payment_date,
      row.paymentDate,
      row.payment_date
    ),
    ...(accountId ? { accountId } : {})
  };
}

function loanRecord(row: Record<string, unknown>, accountId: string): Record<string, unknown> {
  return {
    ...row,
    monthlyPayment: firstFinite(row.monthlyPayment, row.monthly_payment),
    amount: firstFinite(row.amount, row.balance),
    ...(accountId ? { accountId } : {})
  };
}

function transactionRecord(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    amount: finiteOrNull(row.amount),
    transactionDate: firstString(row.transactionDate, row.transaction_date, row.date)
  };
}

/**
 * Collect every presentable entity from one successful tool result. Each row is
 * its own candidate; account/merchant/location lists are never collapsed into a
 * single card. Duplicates are dropped by kind+id. Defensive: malformed payloads
 * return an empty list rather than throwing.
 */
export function collectCardCandidates(
  toolName: string,
  args: Record<string, unknown>,
  payload: unknown,
  session: Session
): CardCandidate[] {
  const candidates: CardCandidate[] = [];
  const seen = new Set<string>();
  const push = (
    kind: CardKind,
    id: string,
    record: Record<string, unknown>,
    accountId?: string
  ): void => {
    if (!id) return;
    const key = `${kind}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    const candidate: CardCandidate = { kind, id, record };
    if (accountId) candidate.accountId = accountId;
    candidates.push(candidate);
  };

  try {
    if (ACCOUNT_TOOLS.has(toolName)) {
      for (const row of asItems(payload)) {
        push('account', idOf(row), row);
      }
      return candidates;
    }

    if (BILL_TOOLS.has(toolName)) {
      for (const row of asItems(payload)) {
        const id = firstString(row.billId, row._id, row.id);
        if (!id) continue;
        const accountId = firstString(row.accountId, row.account_id);
        push('bill', id, billRecord(row, id, accountId), accountId);
      }
      return candidates;
    }

    if (LOAN_TOOLS.has(toolName)) {
      for (const row of asItems(payload)) {
        const id = firstString(row.loanId, row._id, row.id);
        if (!id) continue;
        const accountId = firstString(row.accountId, row.account_id);
        push('loan', id, loanRecord(row, accountId), accountId);
      }
      return candidates;
    }

    if (TRANSACTION_TOOLS.has(toolName)) {
      const accountId = firstString(args.accountId, args.account_id);
      for (const row of asItems(payload)) {
        const id = idOf(row);
        if (!id) continue;
        push('transaction', id, transactionRecord(row), accountId);
      }
      return candidates;
    }

    if (MERCHANT_TOOLS.has(toolName)) {
      for (const row of asItems(payload)) {
        push('merchant', idOf(row), row);
      }
      return candidates;
    }

    if (LOCATION_TOOLS.has(toolName)) {
      for (const row of asItems(payload)) {
        push('location', idOf(row), row);
      }
      return candidates;
    }

    if (PROFILE_TOOLS.has(toolName)) {
      const customerId = session.customer.id;
      for (const row of asItems(payload)) {
        const id = idOf(row);
        // Only the session customer's own profile is a candidate.
        if (id && id === customerId) push('profile', id, row);
      }
      return candidates;
    }

    return candidates;
  } catch {
    return candidates;
  }
}

function ownsCandidate(kind: CardKind, candidate: CardCandidate, session: Session): boolean {
  const accountIds = new Set(session.accounts.map((account) => account.id));
  switch (kind) {
    case 'account':
      return accountIds.has(candidate.id);
    case 'bill':
    case 'loan':
    case 'transaction':
      return Boolean(candidate.accountId) && accountIds.has(candidate.accountId as string);
    case 'profile':
      return candidate.id === session.customer.id;
    case 'merchant':
    case 'location':
      // Public reference data; no account ownership to check.
      return true;
    default:
      return false;
  }
}

function normalize(
  kind: CardKind,
  candidate: CardCandidate,
  session: Session
): EntityCard | null {
  const customerId = session.customer.id;
  switch (kind) {
    case 'account':
      return accountCard(candidate.record, 0, 1, { customerId });
    case 'bill':
      return billCard({ bills: [candidate.record] }, 0, 1, { customerId });
    case 'loan':
      return loanCard({ items: [candidate.record] }, 0, 1, { customerId });
    case 'transaction':
      return transactionCard(
        candidate.record,
        candidate.accountId,
        customerId,
        0,
        1
      );
    case 'merchant':
      return merchantCard({ items: [candidate.record] }, 0, 1, { customerId });
    case 'location':
      return locationCard({ results: [candidate.record] }, 0, 1, { customerId });
    case 'profile':
      return profileCard({ items: [candidate.record] }, 0, 1);
    default:
      return null;
  }
}

/**
 * Resolve a `present_card({kind,id})` request against this turn's candidates and
 * validate ownership. Returns a normalized copy of the card or null when the id
 * is unknown, the kind mismatches, or the entity belongs to another customer.
 */
export function resolvePresentCard(
  candidates: CardCandidate[],
  kind: string,
  id: string,
  session: Session
): EntityCard | null {
  try {
    const wantedKind = str(kind).toLowerCase();
    const wantedId = str(id);
    if (!wantedId || !isCardKind(wantedKind)) return null;

    const list = Array.isArray(candidates) ? candidates : [];
    const candidate = list.find(
      (entry) => entry && entry.kind === wantedKind && entry.id === wantedId
    );
    if (!candidate) return null;
    if (!ownsCandidate(wantedKind, candidate, session)) return null;

    return normalize(wantedKind, candidate, session);
  } catch {
    return null;
  }
}
