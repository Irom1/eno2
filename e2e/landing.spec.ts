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

  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation.getByText('Explore products')).toBeVisible();
  await expect(navigation.getByRole('button', { name: /sign in/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: "I'd like to open my first account", exact: true })).toHaveAttribute('href', '/setup?start=signup');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('.landing')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('.landing')).toHaveAttribute('data-theme', 'dark');

  const signIn = page.locator('button.existing-account-link');
  await signIn.click();
  await expect(signIn).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(2);
  await page.getByRole('option', { name: 'Jordan Lee' }).click();
  await expect(page.getByRole('option', { name: 'Jordan Lee' })).toHaveAttribute('aria-selected', 'true');
  const sessionRequest = page.waitForRequest((request) =>
    request.url().endsWith('/api/session') && request.method() === 'POST'
  );
  await page.getByRole('link', { name: /Jordan Lee/ }).click();

  await expect(page).toHaveURL(/\/dashboard\?customer=jordan$/);
  expect((await sessionRequest).postDataJSON()).toMatchObject({ customerId: 'jordan' });
  await expect(page.locator('.profile-name')).toHaveText('Jordan');
  await expect(page.locator('.dashboard')).toHaveAttribute('data-theme', 'dark');
});

test('account wheel works with a keyboard and returns focus when dismissed', async ({ page }) => {
  const customersLoaded = page.waitForResponse('**/api/customers');
  await page.goto('/');
  await customersLoaded;
  const signIn = page.locator('button.existing-account-link');
  await expect(signIn).toBeEnabled();
  await signIn.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'Jordan Lee' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(signIn).toHaveAttribute('aria-expanded', 'false');
  await expect(signIn).toBeFocused();
  await signIn.click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
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
  await page.getByRole('button', { name: 'Already have an account? Sign in to demo', exact: true }).click();
  await expect(page.getByText('We couldn’t load your accounts.')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('option', { name: 'Jordan Lee' })).toBeVisible();
});

test('mobile layout fits and keeps the account list accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation.getByText('Explore products')).toBeHidden();
  await expect(navigation.getByRole('button', { name: /sign in/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Already have an account? Sign in to demo', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Jordan Lee' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
