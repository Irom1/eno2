import { expect, test } from '@playwright/test';

const customers = [
  { id: 'maya', firstName: 'Maya', lastName: 'Chen', city: 'Boston', state: 'MA' },
  { id: 'jordan', firstName: 'Jordan', lastName: 'Lee', city: 'Arlington', state: 'VA' }
];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/customers', (route) => route.fulfill({ json: { customers } }));
});

test('landing links sign up and opens the chosen customer’s dashboard with the same theme', async ({ page }) => {
  await page.route('**/api/session', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/accounts', (route) => route.fulfill({ json: { accounts: [] } }));
  await page.route('**/api/overview', (route) => route.fulfill({ json: {} }));
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Sign up', exact: true })).toHaveAttribute('href', '/signup');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('.landing')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('.landing')).toHaveAttribute('data-theme', 'dark');

  const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
  await signIn.click();
  await expect(signIn).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('navigation', { name: 'Current accounts' }).getByRole('link')).toHaveCount(2);
  const sessionRequest = page.waitForRequest((request) =>
    request.url().endsWith('/api/session') && request.method() === 'POST'
  );
  await page.getByRole('link', { name: /Jordan Lee/ }).click();

  await expect(page).toHaveURL(/\/dashboard\?customer=jordan$/);
  expect((await sessionRequest).postDataJSON()).toMatchObject({ customerId: 'jordan' });
  await expect(page.locator('.profile-name')).toHaveText('Jordan');
  await expect(page.locator('.dashboard')).toHaveAttribute('data-theme', 'dark');
});

test('account disclosure works with a keyboard and dismisses outside', async ({ page }) => {
  const customersLoaded = page.waitForResponse('**/api/customers');
  await page.goto('/');
  await customersLoaded;
  const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
  await expect(signIn).toBeEnabled();
  await signIn.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: /Maya Chen/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(signIn).toHaveAttribute('aria-expanded', 'false');
  await expect(signIn).toBeFocused();
  await signIn.click();
  await page.getByRole('heading', { level: 1 }).click();
  await expect(signIn).toHaveAttribute('aria-expanded', 'false');
});

test('failed account loading can be retried', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/customers', (route) => {
    attempts += 1;
    return route.fulfill(attempts === 1
      ? { status: 502, json: { customers: [] } }
      : { json: { customers } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('We couldn’t load your accounts.')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('link', { name: /Jordan Lee/ })).toBeVisible();
});

test('mobile layout fits and keeps the account list accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: /Jordan Lee/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
