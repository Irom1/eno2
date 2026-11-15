import { expect, test } from '@playwright/test';
import { MAYA } from './helpers';

const customer = { id: MAYA.id, firstName: 'Maya', lastName: 'Chen' };

const cases = [
  { name: 'no selection', path: '/chat' },
  { name: 'an invalid URL selection', path: '/chat?customer=missing' },
  { name: 'a stale saved selection', path: '/chat', saved: 'missing' },
  { name: 'a guest link without a selection', path: '/chat?topic=open-account' },
  { name: 'a valid URL selection', path: `/chat?customer=${customer.id}`, valid: true },
  { name: 'a valid saved selection', path: '/chat', saved: customer.id, valid: true },
  { name: 'a valid session selection', path: '/chat', session: true, valid: true }
];

for (const { name, path, saved, session, valid } of cases) {
  test(`opening chat with ${name}`, async ({ page }) => {
    let startedSession = false;
    await page.route('**/api/customers*', (route) => {
      const id = new URL(route.request().url()).searchParams.get('customer');
      return route.fulfill({ json: { customers: !id || id === customer.id ? [customer] : [] } });
    });
    await page.route('**/api/session', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: session ? { customer } : {} });
      }
      startedSession = true;
      return route.fulfill({ json: { customer } });
    });
    await page.route('**/api/accounts', (route) => route.fulfill({
      json: { customer, accounts: [], bills: [], recentActivity: [] }
    }));
    if (saved) {
      await page.addInitScript((id) => localStorage.setItem('eno-active-customer', id), saved);
    }

    await page.goto(path);
    if (valid) {
      await expect(page).toHaveURL(`/chat?customer=${customer.id}`);
      await expect(page.getByRole('main', { name: 'Wallet chat' })).toBeVisible();
      await expect(page.locator('.profile-name')).toHaveText('Maya');
    } else {
      await expect(page).toHaveURL('/');
      expect(startedSession).toBe(false);
    }
    await expect(page.getByText('Choose an account to get started.', { exact: true })).toHaveCount(0);
  });
}

test('chat shows a connection error only after the session request fails', async ({ page }) => {
  await page.route('**/api/customers', (route) => route.fulfill({ json: { customers: [customer] } }));
  await page.route('**/api/accounts', (route) => route.fulfill({
    json: { customer, accounts: [], bills: [], recentActivity: [] }
  }));
  const { promise, resolve } = Promise.withResolvers<void>();
  await page.route('**/api/session', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: {} });
    await promise;
    return route.fulfill({ status: 503 });
  });

  try {
    const sessionRequest = page.waitForRequest((request) =>
      request.url().endsWith('/api/session') && request.method() === 'POST'
    );
    await page.goto(`/chat?customer=${customer.id}`);
    await sessionRequest;
    await expect(page.getByRole('main', { name: 'Wallet chat' })).toBeVisible();
    await expect(page.locator('.intro-status')).toHaveCount(0);
  } finally {
    resolve();
  }

  await expect(page.getByText('Unable to connect right now.')).toBeVisible();
});
