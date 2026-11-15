import { snapshotCacheKey, writeWalletCache } from './walletCache';

interface SetupResult { customerId?: string; setupToken?: string; accountError?: string }

/** Each fetch starts a fresh Worker request budget. Never retry a failed write. */
export async function finishAccountSetup<T extends SetupResult>(initial: T, fetchImpl: typeof fetch = fetch): Promise<T> {
  let result = initial;
  try {
    for (let step = 0; result.setupToken && step < 60; step++) {
      const response = await fetchImpl('/api/accounts/setup', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: result.setupToken })
      });
      if (!response.ok) throw new Error('Account setup could not be confirmed');
      const next = await response.json() as SetupResult;
      if (!next.customerId || next.customerId !== initial.customerId) throw new Error('Account setup profile changed');
      result = { ...result, setupToken: undefined, ...next, accountError: next.accountError ?? result.accountError };
    }
    if (result.setupToken) throw new Error('Account setup did not finish');
    return result;
  } catch {
    return { ...result, setupToken: undefined, accountError: 'Your profile is ready, but I couldn’t confirm all of the account setup. Let’s check your dashboard before trying again.' };
  } finally {
    // Returning from setup must fetch the new accounts, even if a dashboard
    // snapshot from just before account creation is still considered fresh.
    if (initial.customerId) writeWalletCache(snapshotCacheKey(initial.customerId), null);
  }
}
