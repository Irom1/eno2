import { beforeEach, expect, it, vi } from 'vitest';
import { DELETE, POST } from './+server';
import { GET } from '../+server';
import { setCustomerRemoved, CustomerRemovalError } from '$lib/server/nessie/removeCustomer';
import { createSession, getSession } from '$lib/server/session';
import { callTool } from '$lib/server/mcp';
import { DELETED_CUSTOMER_PREFIX } from '$lib/customerDeletion';

vi.mock('$lib/server/env', () => ({ resolveEnv: () => ({}) }));
vi.mock('$lib/server/nessie/removeCustomer', async (original) => ({ ...await original<typeof import('$lib/server/nessie/removeCustomer')>(), setCustomerRemoved: vi.fn() }));
vi.mock('$lib/server/mcp', () => ({ withMcp: (_runtime: unknown, work: (client: unknown) => unknown) => work({}), callTool: vi.fn() }));

const makeEvent = (id: string, sessionId?: string, origin = 'http://localhost') => ({ request: new Request(`http://localhost/api/customers/${id}`, { method: 'DELETE', headers: { origin } }), params: { customerId: id }, cookies: { get: () => sessionId, delete: vi.fn() }, platform: undefined }) as unknown as Parameters<typeof DELETE>[0];
beforeEach(() => { vi.resetAllMocks(); vi.mocked(setCustomerRemoved).mockResolvedValue(); });

it('invalidates sessions when a demo profile is removed, and supports undo', async () => {
  const id = crypto.randomUUID();
  const session = createSession({ id, firstName: 'New', lastName: 'Person' }, []);
  const event = makeEvent(id, session.id);
  expect((await DELETE(event)).status).toBe(200);
  expect(getSession(session.id)).toBeNull(); expect(event.cookies.delete).toHaveBeenCalled();
  expect((await POST(makeEvent(id))).status).toBe(200);
  expect(vi.mocked(setCustomerRemoved).mock.calls.map((call) => call.slice(0, 2))).toEqual([[id, true], [id, false]]);
});
it('does not remove protected accounts or accept cross-origin deletion', async () => {
  vi.mocked(setCustomerRemoved).mockRejectedValueOnce(new CustomerRemovalError('Protected', 403));
  expect((await DELETE(makeEvent('maya'))).status).toBe(403);
  expect((await DELETE(makeEvent('other', undefined, 'https://unrelated.example'))).status).toBe(403);
  expect(setCustomerRemoved).toHaveBeenCalledOnce();
});
it('filters persisted removal markers and exposes deletion only for unprotected current/future names', async () => {
  vi.mocked(callTool).mockResolvedValue({ ok: true, data: { items: [
    { _id: 'maya', firstName: 'Maya', lastName: 'Chen' },
    { _id: 'demo', firstName: 'Demo', lastName: 'Tester' },
    { _id: 'new', firstName: 'Future', lastName: 'Person' },
    { _id: 'removed', firstName: DELETED_CUSTOMER_PREFIX + 'Old', lastName: 'Person' }
  ] } } as Awaited<ReturnType<typeof callTool>>);
  const result = await GET({ url: new URL('http://localhost/api/customers') } as Parameters<typeof GET>[0]);
  expect((await result.json()).customers.map(({ id, canDelete }: { id: string; canDelete: boolean }) => ({ id, canDelete }))).toEqual([{ id: 'maya', canDelete: false }, { id: 'demo', canDelete: false }, { id: 'new', canDelete: true }]);
});
