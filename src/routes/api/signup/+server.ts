import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { accountChoiceSchema, accountTypesFor, customerCreateSchema } from '$lib/signup';
import { resolveEnv } from '$lib/server/env';
import { createNessieCustomer, CustomerCreationError } from '$lib/server/nessie/createCustomer';
import { createNessieAccounts } from '$lib/server/nessie/createAccounts';
import { createSession } from '$lib/server/session';
import { SESSION_COOKIE } from '$lib/server/sessionCookie';
import { AddressValidationError, verifyAddress } from '$lib/server/address';
import { recommendDemoCard, spendingComplete, spendingPreferencesSchema } from '$lib/spending';
import type { DemoAccountType } from '$lib/server/nessie/seedTransactions';
import { z } from 'zod';

export const prerender = false;

type Outcome = { customerId: string | null; accountError?: string; setupToken?: string };
interface Attempt { fingerprint: string; result: Promise<Outcome>; createdAt: number }
const attempts = new Map<string, Attempt>();
const TTL = 30 * 60 * 1000;

export async function POST({ request, cookies, platform }: RequestEvent): Promise<Response> {
  const key = request.headers.get('idempotency-key') ?? '';
  if (!/^[a-z0-9-]{20,80}$/i.test(key)) return json({ error: 'Please refresh the page and try again.' }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'That didn’t come through. Please try again.' }, { status: 400 }); }
  const parsed = customerCreateSchema.extend({ accountChoice: accountChoiceSchema.refine((choice) => choice !== 'undecided', 'Choose your accounts before continuing.'), spending: spendingPreferencesSchema.refine(spendingComplete, 'Pick your spending priorities before continuing.'), includeCreditCard: z.boolean() }).safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message, fields: parsed.error.flatten() }, { status: 400 });
  const { accountChoice, spending, includeCreditCard, ...input } = parsed.data;
  const now = Date.now();
  for (const [id, attempt] of attempts) if (now - attempt.createdAt > TTL) attempts.delete(id);
  const fingerprint = JSON.stringify(parsed.data);
  let attempt = attempts.get(key);
  if (attempt && attempt.fingerprint !== fingerprint) return json({ error: 'This introduction was already submitted. Head back to Sign in to find your profile.', created: true }, { status: 409 });
  if (!attempt) {
    if (attempts.size >= 100) return json({ error: 'Sign-up is a little busy. Please try again shortly.' }, { status: 503 });
    const runtime = resolveEnv(platform);
    const result = (async (): Promise<Outcome> => {
      let check;
      try { check = await verifyAddress(input.address); }
      catch { throw new AddressValidationError({ status: 'unavailable', message: 'I couldn’t check that address just now. Your profile hasn’t been created — please try again shortly.' }); }
      if (check.status !== 'matched' || !check.address) throw new AddressValidationError(check);
      const created = await createNessieCustomer({ ...input, address: check.address }, runtime);
      if (!created.customerId) return created;
      const card = includeCreditCard ? recommendDemoCard(spending) : null;
      const types: DemoAccountType[] = [...accountTypesFor(accountChoice), ...(card ? ['Credit Card' as const] : [])];
      try {
        return { ...created, ...await createNessieAccounts(created.customerId, types, runtime, undefined, { card, categories: spending.categories }) };
      } catch {
        return { ...created, accountError: 'Your profile is ready, but I couldn’t finish setting up the accounts. Let’s check your dashboard before trying again.' };
      }
    })();
    attempt = { fingerprint, result, createdAt: now };
    attempts.set(key, attempt);
  }
  try {
    const { customerId, accountError, setupToken } = await attempt.result;
    if (!customerId) return json({ created: true, error: 'Your profile was created, but I couldn’t open it yet. Go to Sign in and choose your name.' }, { status: 202 });
    const session = createSession({ id: customerId, firstName: input.first_name, lastName: input.last_name }, []);
    cookies.set(SESSION_COOKIE, session.id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 1800, secure: new URL(request.url).protocol === 'https:' });
    return json({ customerId, created: true, ...(setupToken ? { setupToken } : {}), ...(accountError ? { accountError } : {}) }, { status: 201 });
  } catch (error) {
    if (error instanceof AddressValidationError) {
      attempts.delete(key);
      return json({ error: error.message, addressCheck: error.check }, { status: error.check.status === 'unavailable' ? 503 : 422 });
    }
    if (error instanceof CustomerCreationError) {
      if (!error.mayBeCreated) attempts.delete(key);
      return json({ error: error.message, ...(error.mayBeCreated ? { created: true } : {}) }, { status: error.status });
    }
    return json({ error: 'I couldn’t confirm your profile. Please check Sign in before trying again.', created: true }, { status: 502 });
  }
}
