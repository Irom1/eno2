import { customerName, type CustomerIdentity } from './customerDeletion';

/** Pin the two permanent demo profiles; preserve the order of everyone else. */
export function orderCustomers<T extends CustomerIdentity>(customers: readonly T[]): T[] {
  const rank = (customer: T) => {
    const name = customerName(customer).toLowerCase().replace(/\s+/g, ' ');
    return name === 'maya chen' ? 0 : name === 'demo tester' ? 1 : 2;
  };
  return [...customers].sort((a, b) => rank(a) - rank(b));
}

const SELECTED_CUSTOMER_KEY = 'eno-active-customer';
export function savedCustomerId(): string {
  try { return localStorage.getItem(SELECTED_CUSTOMER_KEY) ?? ''; }
  catch { return ''; }
}
export function rememberCustomerId(id: string): void {
  try { localStorage.setItem(SELECTED_CUSTOMER_KEY, id); }
  catch { /* The URL and session still preserve the selection when storage is unavailable. */ }
}
