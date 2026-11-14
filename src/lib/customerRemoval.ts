export interface RemovedCustomer { id: string; name: string }
const historyKey = 'eno-removed-customers';
let history: RemovedCustomer[] = [];
function readHistory(): RemovedCustomer[] {
  try {
    const saved = JSON.parse(localStorage.getItem(historyKey) || '[]');
    if (Array.isArray(saved)) history = saved.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string');
  } catch { /* Undo still works in memory when storage is unavailable. */ }
  return history;
}
function saveHistory() { try { localStorage.setItem(historyKey, JSON.stringify(history)); } catch { /* Keep this visit’s history. */ } }
export function lastRemovedCustomer(): RemovedCustomer | null { return readHistory().at(-1) ?? null; }
export function rememberRemovedCustomer(customer: RemovedCustomer): RemovedCustomer {
  history = [...readHistory().filter((item) => item.id !== customer.id), customer].slice(-50); saveHistory(); return customer;
}
export function forgetRemovedCustomer(id: string): RemovedCustomer | null {
  history = readHistory().filter((item) => item.id !== id); saveHistory(); return history.at(-1) ?? null;
}
export async function changeCustomerRemoval(id: string, removed: boolean) {
  const response = await fetch(`/api/customers/${encodeURIComponent(id)}`, { method: removed ? 'DELETE' : 'POST', headers: { 'content-type': 'application/json' } });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || 'Couldn’t change this account. Please try again.');
}
