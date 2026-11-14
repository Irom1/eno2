import { products } from '../../products';
import { demoCardNicknames } from '../../spending';
type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);

/** Reconcile our generated demo accounts against their stored Nessie history.
 * Nessie does not update metadata when deposit/withdrawal records are created. */
export async function reconcileDemoAccount(value: unknown, read: (path: string) => Promise<unknown>): Promise<unknown> {
  if (!isRow(value) || typeof value._id !== 'string' ||
      !((value.type === 'Checking' && (value.nickname === 'Everyday Checking' || value.nickname === products.checking.name)) ||
        (value.type === 'Savings' && (value.nickname === 'My Savings' || value.nickname === products.savings.name)) ||
        (value.type === 'Credit Card' && typeof value.nickname === 'string' && demoCardNicknames.includes(value.nickname)))) return value;
  const path = `/accounts/${encodeURIComponent(value._id)}`;
  const deposits = await read(`${path}/deposits`);
  const credit = value.type === 'Credit Card';
  if (!Array.isArray(deposits)) throw new Error('Demo transaction history is unavailable');
  if (!credit && !deposits.some((item) => isRow(item) && item.description === 'DEMO OPENING DEPOSIT')) return value;
  const withdrawals = await read(`${path}/withdrawals`);
  if (!Array.isArray(withdrawals)) throw new Error('Demo transaction history is unavailable');
  if (credit && !withdrawals.some((item) => isRow(item) && item.description === 'DEMO OPENING PURCHASE')) return value;
  const total = (rows: unknown[]) => rows.reduce<number>((sum, item) => {
    if (!isRow(item) || item.status !== 'completed') return sum;
    const amount = Number(item.amount);
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
  }, 0);
  const spending = total(withdrawals);
  return { ...value, balance: Math.round((credit ? spending - total(deposits) : total(deposits) - spending) * 100) / 100, rewards: Math.floor(spending) };
}
