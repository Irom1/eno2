/** Shared wallet shapes and display helpers for the live Nessie dashboard. */

export interface WalletAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface WalletCustomer {
  id: string;
  firstName: string;
  lastName: string;
  address?: WalletAddress;
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
}

export type AccountTint = 'aqua' | 'slate' | 'peach' | 'rose';

const typeOf = (type: string): string => String(type ?? '').toLowerCase();

export function accountEnding(account: Pick<WalletAccount, 'accountNumber'>): string {
  const digits = String(account.accountNumber ?? '').replace(/\D+/g, '');
  return digits.slice(-4);
}

export function accountTint(type: string): AccountTint {
  const normalized = typeOf(type);
  if (normalized.includes('checking')) return 'aqua';
  if (normalized.includes('savings')) return 'slate';
  if (normalized.includes('credit')) return 'peach';
  return 'rose';
}

export function isCredit(type: string): boolean {
  return typeOf(type).includes('credit');
}

export function accountKind(type: string): string {
  return typeOf(type).includes('checking') ? 'Available balance' : 'Current balance';
}

export function accountBalanceLabel(type: string): string {
  return accountKind(type);
}

const ACTIVE_BILL_STATUSES = new Set(['pending', 'recurring']);

function isActiveBill(bill: WalletBill): boolean {
  return ACTIVE_BILL_STATUSES.has(String(bill.status ?? '').toLowerCase());
}

export function scheduledTotal(bills: readonly WalletBill[], accountId: string): number {
  const total = bills
    .filter((bill) => bill.accountId === accountId && isActiveBill(bill))
    .reduce((sum, bill) => sum + (Number.isFinite(bill.amount) ? bill.amount : 0), 0);
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

export function upcomingBills(bills: readonly WalletBill[]): WalletBill[] {
  return bills
    .filter((bill) => isActiveBill(bill) && /^\d{4}-\d{2}-\d{2}/.test(String(bill.upcomingDate ?? '')))
    .sort((a, b) => a.upcomingDate.localeCompare(b.upcomingDate));
}

export function formatAmount(value: unknown): string {
  const parsed = typeof value === 'number' ? value : Number(value);
  return (Number.isFinite(parsed) ? parsed : 0).toFixed(2);
}
