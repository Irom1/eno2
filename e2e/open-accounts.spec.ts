import { expect, test, type Page } from '@playwright/test';
import { availableProducts, openingProducts, type AccountProductId } from '../src/lib/accountOpening';

const customer = { id: 'existing-ada', firstName: 'Ada', lastName: 'Lovelace', city: 'Boston', state: 'MA' };
const checking = { id: 'checking', type: 'Checking', nickname: 'Everyday Checking', accountNumber: '1234', balance: 500, rewards: 20 };
const venture = { id: 'venture', type: 'Credit Card', nickname: 'Venture Rewards', accountNumber: '4567', balance: 200, rewards: 30 };

async function fixtures(page: Page, initial = [checking, venture], mode: 'success' | 'stale' | 'partial' | 'uncertain' = 'success') {
  let accounts = [...initial];
  const submissions: { customerId: string; products: AccountProductId[] }[] = [];
  const keys: string[] = [];
  let addressCalls = 0, signupCalls = 0;
  await page.route('**/api/customers*', (route) => route.fulfill({ json: { customers: [customer] } }));
  await page.route('**/api/session', (route) => route.fulfill({ json: { customer, accounts } }));
  await page.route('**/api/accounts', (route) => route.fulfill({ json: { customer, accounts, bills: [], loans: [], recentActivity: [] } }));
  await page.route('**/api/overview', (route) => route.fulfill({ json: { overview: { totalRewards: accounts.reduce((sum, account) => sum + account.rewards, 0) } } }));
  await page.route('**/api/climate?**', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/addresses/**', (route) => { addressCalls++; return route.fulfill({ json: {} }); });
  await page.route('**/api/signup', (route) => { signupCalls++; return route.fulfill({ status: 500 }); });
  await page.route('**/api/signup/chat', (route) => { signupCalls++; return route.fulfill({ status: 500 }); });
  await page.route('**/api/accounts/open*', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { customer, available: availableProducts(accounts) } });
    const body = route.request().postDataJSON();
    submissions.push(body); keys.push(route.request().headers()['idempotency-key']);
    if (mode === 'uncertain') return route.abort('failed');
    if (mode === 'stale' && submissions.length === 1) {
      accounts.push({ id: 'savings', type: 'Savings', nickname: '360 Performance Savings', accountNumber: '7890', balance: 800, rewards: 100 });
      return route.fulfill({ status: 409, json: { error: 'You already have one of those accounts. I’ve refreshed the remaining choices.' } });
    }
    for (const id of body.products as AccountProductId[]) {
      const option = openingProducts.find((product) => product.id === id)!;
      accounts.push({ id: `new-${id}`, type: option.type, nickname: option.name, accountNumber: '7890', balance: 800, rewards: 100 });
    }
    return route.fulfill({ status: mode === 'partial' ? 202 : 201, json: { customerId: customer.id, ...(mode === 'partial' ? { accountError: 'Your account is ready, but only some of its sample activity could be confirmed.' } : {}) } });
  });
  return { submissions, keys, noOnboardingCalls: () => expect({ addressCalls, signupCalls }).toEqual({ addressCalls: 0, signupCalls: 0 }) };
}

test('dashboard opens a personalized account dropdown without repeating signup and redirects with new products', async ({ page }) => {
  const state = await fixtures(page);
  await page.goto(`/dashboard?customer=${customer.id}`);
  const link = page.getByRole('link', { name: 'Open a new account', exact: true });
  await expect(link).toHaveAttribute('href', `/setup?customer=${customer.id}&mode=accounts`);
  await link.click();
  await expect(page.getByText('Hey, Ada!', { exact: false })).toBeVisible();
  const options = page.getByRole('group', { name: 'Available accounts' });
  await expect(options.getByRole('checkbox')).toHaveCount(4);
  await expect(options.getByRole('checkbox', { name: /360 Checking|Venture/ })).toHaveCount(0);
  await options.getByRole('checkbox', { name: /360 Performance Savings/ }).check();
  await options.getByRole('checkbox', { name: /Capital One Savor/ }).check();
  await options.getByRole('checkbox', { name: /Capital One Quicksilver/ }).check();
  await page.getByRole('textbox', { name: 'Message Eno' }).fill('yes');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page).toHaveURL(`/dashboard?customer=${customer.id}`);
  await expect(page.locator('article.account')).toHaveCount(5);
  expect(state.submissions).toEqual([{ customerId: customer.id, products: ['savings', 'savor', 'quicksilver'] }]);
  expect(state.keys[0]).toMatch(/^[a-z0-9-]{20,80}$/i);
  state.noOnboardingCalls();
  // Reopening the flow reflects the expanded wallet, rather than cached choices.
  await page.getByRole('link', { name: 'Open a new account', exact: true }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: /Discover it Cash Back/ })).toBeVisible();
});

test('empty profiles can open accounts and the button submits once', async ({ page }) => {
  const state = await fixtures(page, []);
  await page.goto(`/dashboard?customer=${customer.id}`);
  await page.getByRole('link', { name: 'Open a new account', exact: true }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(6);
  await expect(page.getByRole('button', { name: /Open selected accounts/ })).toBeDisabled();
  await page.getByRole('checkbox', { name: /360 Checking/ }).check();
  await page.getByRole('button', { name: /Open selected accounts/ }).click();
  await expect(page).toHaveURL(`/dashboard?customer=${customer.id}`);
  expect(state.submissions).toHaveLength(1);
});

test('all products owned gives a dashboard exit with no empty selection to submit', async ({ page }) => {
  const all = openingProducts.map((option) => ({ id: option.id, type: option.type, nickname: option.name, accountNumber: '1234', balance: 500, rewards: 20 }));
  const state = await fixtures(page, all);
  await page.goto(`/setup?customer=${customer.id}&mode=accounts`);
  await expect(page.getByText('You already have every product', { exact: false })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('link', { name: /Open my dashboard/ }).click();
  await expect(page).toHaveURL(`/dashboard?customer=${customer.id}`);
  expect(state.submissions).toHaveLength(0);
});

test('stale selections refresh without creating accounts or continuing automatically', async ({ page }) => {
  const state = await fixtures(page, [checking, venture], 'stale');
  await page.goto(`/setup?customer=${customer.id}&mode=accounts`);
  await page.getByRole('checkbox', { name: /360 Performance Savings/ }).check();
  await page.getByRole('button', { name: /Open selected accounts/ }).click();
  await expect(page.getByText('I’ve refreshed the remaining choices.', { exact: false })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Savings/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /Open selected accounts/ })).toBeDisabled();
  expect(state.submissions).toHaveLength(1);
});

test('partial creation and lost acknowledgements offer the dashboard and prevent blind retries', async ({ page }) => {
  for (const mode of ['partial', 'uncertain'] as const) {
    const state = await fixtures(page, [checking, venture], mode);
    await page.goto(`/setup?customer=${customer.id}&mode=accounts`);
    await page.getByRole('checkbox', { name: /360 Performance Savings/ }).check();
    await page.getByRole('button', { name: /Open selected accounts/ }).click();
    await expect(page.getByRole('link', { name: /Open my dashboard/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Open selected accounts/ })).toBeDisabled();
    expect(state.submissions).toHaveLength(1);
  }
});

test('account opening keeps a new-user draft intact and supports mobile, theme, speech, and questions', async ({ page }) => {
  await fixtures(page);
  await page.addInitScript(() => {
    sessionStorage.setItem('eno-signup-conversation-v2', 'untouched draft');
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [], cancel: () => {}, speak: (utterance: SpeechSynthesisUtterance) => document.documentElement.setAttribute('data-spoken-text', utterance.text)
    } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/setup?customer=${customer.id}&mode=accounts`);
  await expect(page.getByRole('checkbox')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Enable Eno voice' })).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-spoken-text');
  await page.getByRole('button', { name: 'Read Eno message aloud' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-spoken-text', /Hey, Ada/);
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('.existing-signup')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('textbox', { name: 'Message Eno' }).fill('What is Savor?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Capital One Savor: for food', { exact: false })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-spoken-text', /Hey, Ada/);
  await page.getByRole('button', { name: 'Read Eno message aloud' }).last().click();
  await expect(page.locator('html')).toHaveAttribute('data-spoken-text', /Capital One Savor: for food/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem('eno-signup-conversation-v2'))).toBe('untouched draft');
  await page.getByRole('link', { name: 'Back to dashboard', exact: true }).click();
  await expect(page).toHaveURL(`/dashboard?customer=${customer.id}`);
});
