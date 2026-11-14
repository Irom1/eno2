import type { RuntimeEnv } from '../env';
import type { FetchLike } from './client';

/** Only the explicitly selected zero-balance demo accounts can be opened. */
export async function createNessieAccounts(
  customerId: string,
  types: readonly ('Checking' | 'Savings')[],
  runtime: Pick<RuntimeEnv, 'NESSIE_API_KEY' | 'NESSIE_BASE_URL'>,
  fetchImpl: FetchLike = fetch
): Promise<{ accountError?: string }> {
  for (const type of [...new Set(types)]) {
    const url = new URL(`/customers/${encodeURIComponent(customerId)}/accounts`, runtime.NESSIE_BASE_URL);
    url.searchParams.set('key', runtime.NESSIE_API_KEY);
    try {
      const response = await fetchImpl(url, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ type, nickname: type === 'Checking' ? 'Everyday Checking' : 'My Savings', balance: 0, rewards: 0 }),
        redirect: 'error', signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) throw new Error('Account request failed');
    } catch {
      // A write can succeed before a connection fails. Never retry it blindly.
      return { accountError: `Your profile is ready, but I couldn’t confirm the ${type.toLowerCase()} account. Let’s check your dashboard before trying to open another one.` };
    }
  }
  return {};
}
