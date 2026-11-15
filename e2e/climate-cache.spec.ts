import { expect, test, type Page } from '@playwright/test';
import { buildReport } from '../src/lib/climate/emissions';
import { collectErrors, expectNoErrors, type CollectedErrors } from './helpers';

let errors: CollectedErrors;
test.beforeEach(({ page }) => { errors = collectErrors(page); });
test.afterEach(() => {
  // A deliberate page refresh can cancel a background session refresh.
  expectNoErrors({ ...errors, apiErrors: errors.apiErrors.filter((error) => !error.endsWith('net::ERR_ABORTED')) });
});

const ada = { id: 'ada', firstName: 'Ada', lastName: 'Lovelace' };
const bea = { id: 'bea', firstName: 'Bea', lastName: 'Jones' };
async function fixtures(page: Page, delayed = false) {
  let active = ada;
  const accountIds: Record<string, string[]> = { ada: ['ada-checking'], bea: ['bea-checking'] };
  const calls: string[] = [];
  let release!: () => void;
  const gate = delayed ? new Promise<void>((resolve) => { release = resolve; }) : Promise.resolve();
  const accounts = () => accountIds[active.id].map((id) => ({ id, type: 'Checking', nickname: '360 Checking', accountNumber: '1234', balance: 500, rewards: 20 }));
  await page.route('**/api/customers*', (route) => route.fulfill({ json: { customers: [ada, bea] } }));
  await page.route('**/api/session', (route) => {
    if (route.request().method() === 'POST') active = route.request().postDataJSON().customerId === ada.id ? ada : bea;
    return route.fulfill({ json: { customer: active, accounts: accounts() } });
  });
  await page.route('**/api/accounts', (route) => route.fulfill({ json: { customer: active, accounts: accounts(), bills: [], loans: [], recentActivity: [] } }));
  await page.route('**/api/climate?**', async (route) => {
    const id = new URL(route.request().url()).searchParams.get('customer')!;
    calls.push(id);
    await gate;
    await route.fulfill({ json: { customer: { id }, report: { ...buildReport([], { days: 90 }), score: id === ada.id ? 720 : 640, tier: id === ada.id ? 'Good' : 'Fair' } } });
  });
  return { calls, accountIds, release: () => release() };
}
const score = (page: Page, value = 720) => page.getByRole('img', { name: new RegExp(`^ClimateWise score: ${value} out of 850`) });

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`closing chat keeps the same loaded score after a complete transition (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    const state = await fixtures(page);
    await page.goto('/dashboard?customer=ada');
    await expect(score(page)).toBeVisible();
    const originalGauge = await score(page).elementHandle();
    expect(originalGauge).not.toBeNull();
    for (let turn = 0; turn < 3; turn++) {
      await page.getByRole('textbox', { name: 'Ask Capital One' }).focus();
      await expect(page).toHaveURL(/\/chat\?customer=ada$/);
      // Wait until the dashboard's closing animation really finishes.
      await expect(page.locator('.account-overview')).toBeHidden();
      expect(await originalGauge!.evaluate((gauge) => gauge.isConnected)).toBe(true);
      await page.getByRole('link', { name: 'Capital One dashboard' }).click();
      await expect(page).toHaveURL(/\/dashboard\?customer=ada$/);
      await expect(score(page)).toBeVisible();
      expect(await originalGauge!.evaluate((gauge) => gauge.isConnected)).toBe(true);
      expect(state.calls).toEqual(['ada']);
    }
  });
}

test('cached LORAX score survives closing chat, browser refresh, and the full report page', async ({ page }) => {
  const state = await fixtures(page);
  await page.goto('/dashboard?customer=ada');
  await expect(score(page)).toBeVisible();
  await page.getByRole('textbox', { name: 'Ask Capital One' }).focus();
  await expect(page).toHaveURL(/\/chat\?customer=ada$/);
  await page.getByRole('link', { name: 'Capital One dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard\?customer=ada$/);
  await expect(score(page)).toBeVisible();
  expect(state.calls).toEqual(['ada']);
  await page.reload();
  await expect(score(page)).toBeVisible();
  expect(state.calls).toEqual(['ada']);
  await page.getByRole('link', { name: 'Check your LORAX® score' }).click();
  await expect(page).toHaveURL(/\/climatewise\?customer=ada$/);
  await expect(page.getByRole('region', { name: 'Footprint' })).toBeVisible();
  await expect(page.getByText('Loading your report…', { exact: true })).toHaveCount(0);
  expect(state.calls).toEqual(['ada']);
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\?customer=ada$/);
  await expect(score(page)).toBeVisible();
  expect(state.calls).toEqual(['ada']);
});

test('profile switching keeps each cached score separate and reuses it when switching back', async ({ page }) => {
  const state = await fixtures(page);
  await page.goto('/dashboard?customer=ada');
  await expect(score(page)).toBeVisible();
  await page.locator('.profile').click();
  await page.getByRole('menuitemradio', { name: /Bea Jones/ }).click();
  await expect(score(page, 640)).toBeVisible();
  await page.locator('.profile').click();
  await page.getByRole('menuitemradio', { name: /Ada Lovelace/ }).click();
  await expect(score(page)).toBeVisible();
  expect(state.calls).toEqual(['ada', 'bea']);
});

test('an in-flight score request is reused if chat opens and closes before it finishes', async ({ page }) => {
  const state = await fixtures(page, true);
  await page.goto('/dashboard?customer=ada');
  await expect.poll(() => state.calls.length).toBe(1);
  await page.getByRole('textbox', { name: 'Ask Capital One' }).focus();
  await expect(page).toHaveURL(/\/chat\?customer=ada$/);
  await page.getByRole('link', { name: 'Capital One dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard\?customer=ada$/);
  state.release();
  await expect(score(page)).toBeVisible();
  expect(state.calls).toEqual(['ada']);
});

test('adding or removing an account refreshes the score instead of keeping an old wallet report', async ({ page }) => {
  const state = await fixtures(page);
  await page.goto('/dashboard?customer=ada');
  await expect(score(page)).toBeVisible();
  state.accountIds.ada.push('new-savings');
  await page.reload();
  await expect(score(page)).toBeVisible();
  expect(state.calls).toHaveLength(2);
  state.accountIds.ada = ['new-savings'];
  await page.reload();
  await expect(score(page)).toBeVisible();
  expect(state.calls).toHaveLength(3);
});
