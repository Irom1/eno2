/**
 * Normalized wallet shapes shared by the account APIs.
 *
 * Raw Nessie payloads use snake_case and the MCP summaries use camelCase; these
 * helpers accept both so the APIs can consume either without surprise.
 */
import { toMoney } from './nessie/format';
import { demoTransactionImpact } from '../transactionImpact';

export interface WalletCustomer {
  id: string;
  firstName: string;
  lastName: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

export interface WalletAccount {
  id: string;
  type: string;
  nickname: string;
  balance: number;
  rewards: number;
  accountNumber: string;
  customerId: string;
}

export interface WalletBill {
  id: string;
  status: string;
  payee: string;
  nickname: string;
  amount: number;
  upcomingDate: string;
  recurringDay?: number | string;
  paymentDate?: string;
  creationDate?: string;
  accountId: string;
}

export interface WalletLoan {
  id: string;
  type: string;
  status: string;
  monthlyPayment: number;
  amount: number;
  description: string;
  creditScore?: number;
  creationDate?: string;
  accountId: string;
}

export interface WalletTransaction {
  id: string;
  kind: 'deposit' | 'withdrawal';
  amount: number;
  description: string;
  date: string;
  status: string;
  medium?: string;
  balanceAfter?: number;
  demoImpact?: 'green' | 'non-green';
}

type AnyRecord = Record<string, unknown>;

const rec = (value: unknown): AnyRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as AnyRecord) : {};

const str = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value);

const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const pick = (raw: AnyRecord, camel: string, snake: string): unknown =>
  raw[camel] ?? raw[snake];

const optionalString = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
};

const optionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function normalizeAddress(value: unknown): WalletCustomer['address'] {
  const address = rec(value);
  const street = optionalString(address.street) ??
    [address.street_number, address.street_name]
      .filter((part) => part !== undefined && part !== null && String(part).trim() !== '')
      .join(' ')
      .trim();

  const result = {
    street: street || undefined,
    city: optionalString(address.city),
    state: optionalString(address.state),
    zip: optionalString(address.zip)
  };
  return result.street || result.city || result.state || result.zip ? result : undefined;
}

export function normalizeCustomer(raw: unknown): WalletCustomer {
  const customer = rec(raw);
  return {
    id: str(pick(customer, '_id', 'id') ?? customer._id),
    firstName: str(pick(customer, 'firstName', 'first_name')),
    lastName: str(pick(customer, 'lastName', 'last_name')),
    address: normalizeAddress(customer.address)
  };
}

export function normalizeAccount(raw: unknown): WalletAccount {
  const account = rec(raw);
  return {
    id: str(pick(account, '_id', 'id') ?? account._id),
    type: str(account.type),
    nickname: str(account.nickname),
    balance: toMoney(num(account.balance)),
    rewards: num(account.rewards),
    accountNumber: str(pick(account, 'accountNumber', 'account_number')),
    customerId: str(pick(account, 'customerId', 'customer_id'))
  };
}

export function normalizeBill(raw: unknown): WalletBill {
  const bill = rec(raw);
  const recurring = pick(bill, 'recurringDate', 'recurring_date');
  const paymentDate = optionalString(pick(bill, 'paymentDate', 'payment_date'));
  const creationDate = optionalString(pick(bill, 'creationDate', 'creation_date'));

  return {
    id: str(pick(bill, '_id', 'id') ?? bill._id),
    status: str(bill.status),
    payee: str(bill.payee),
    nickname: str(bill.nickname),
    amount: toMoney(num(pick(bill, 'paymentAmount', 'payment_amount'))),
    upcomingDate: str(pick(bill, 'upcomingPaymentDate', 'upcoming_payment_date')),
    ...(recurring === undefined || recurring === null || recurring === ''
      ? {}
      : { recurringDay: typeof recurring === 'number' ? recurring : String(recurring) }),
    ...(paymentDate ? { paymentDate } : {}),
    ...(creationDate ? { creationDate } : {}),
    accountId: str(pick(bill, 'accountId', 'account_id'))
  };
}

export function normalizeLoan(raw: unknown, accountId: string): WalletLoan {
  const loan = rec(raw);
  const creditScore = optionalNumber(pick(loan, 'creditScore', 'credit_score'));
  const creationDate = optionalString(pick(loan, 'creationDate', 'creation_date'));

  return {
    id: str(pick(loan, '_id', 'id') ?? loan._id),
    type: str(loan.type),
    status: str(loan.status),
    monthlyPayment: toMoney(num(pick(loan, 'monthlyPayment', 'monthly_payment'))),
    amount: toMoney(num(loan.amount)),
    description: str(loan.description),
    ...(creditScore === undefined ? {} : { creditScore }),
    ...(creationDate ? { creationDate } : {}),
    accountId: str(accountId || pick(loan, 'accountId', 'account_id'))
  };
}

export function normalizeTransaction(
  raw: unknown,
  kind: 'deposit' | 'withdrawal'
): WalletTransaction {
  const transaction = rec(raw);
  const medium = optionalString(pick(transaction, 'medium', 'medium'));
  return {
    id: str(pick(transaction, '_id', 'id') ?? transaction._id),
    kind,
    amount: toMoney(num(transaction.amount)),
    description: str(transaction.description),
    date: str(pick(transaction, 'transactionDate', 'transaction_date')),
    status: str(transaction.status),
    ...(demoTransactionImpact(str(transaction.description)) ? { demoImpact: demoTransactionImpact(str(transaction.description)) } : {}),
    ...(medium ? { medium } : {})
  };
}

function compareTransactions(a: WalletTransaction, b: WalletTransaction): number {
  const byDate = b.date.localeCompare(a.date);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}

/**
 * Merge the two transaction feeds, sort newest first, and walk backwards from
 * the current account balance to derive each transaction's resulting balance.
 */
export function mergeTransactions(
  deposits: unknown[],
  withdrawals: unknown[],
  currentBalance: number,
  credit = false
): WalletTransaction[] {
  const transactions = [
    ...(Array.isArray(deposits) ? deposits : []).map((item) =>
      normalizeTransaction(item, 'deposit')
    ),
    ...(Array.isArray(withdrawals) ? withdrawals : []).map((item) =>
      normalizeTransaction(item, 'withdrawal')
    )
  ].sort(compareTransactions);

  let running = toMoney(num(currentBalance));
  for (const transaction of transactions) {
    if (['pending', 'cancelled', 'canceled', 'failed'].includes(transaction.status.toLowerCase())) continue;
    transaction.balanceAfter = running;
    running = toMoney(
      running - (transaction.kind === 'deposit' ? transaction.amount : -transaction.amount) * (credit ? -1 : 1)
    );
  }

  return transactions;
}

export function recentActivity<T extends WalletTransaction>(
  transactions: T[],
  limit = 5
): T[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 5;
  return [...(Array.isArray(transactions) ? transactions : [])]
    .sort(compareTransactions)
    .slice(0, safeLimit);
}
