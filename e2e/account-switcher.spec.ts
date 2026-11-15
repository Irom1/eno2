import { expect, test, type Page } from '@playwright/test';

const maya = { id: 'maya', firstName: 'Maya', lastName: 'Chen', city: 'Cambridge', state: 'MA' };
const demo = { id: 'demo', firstName: 'Demo', lastName: 'Tester', city: 'Boston', state: 'MA' };
const future = { id: 'future', firstName: 'Future', lastName: 'Person', city: 'Arlington', state: 'MA' };

async function fixtures(page: Page) {
  // Deliberately shuffled; the server order must not change which profiles are pinned.
  const customers = [future, demo, maya];
  let active = maya;
  await page.route('**/api/customers', (route) => route.fulfill({ json: { customers } }));
  await page.route('**/api/session', (route) => {
    if (route.request().method() === 'POST') active = customers.find((customer) => customer.id === route.request().postDataJSON().customerId)!;
    return route.fulfill({ json: { customer: active, accounts: [] } });
  });
  await page.route('**/api/accounts', (route) => route.fulfill({ json: { customer: active, accounts: [{ id: 'checking', type: 'Checking', nickname: `${active.firstName} Checking`, accountNumber: '1234', balance: 500, rewards: 0 }], bills: [], loans: [], recentActivity: [] } }));
  await page.route('**/api/overview', (route) => route.fulfill({ json: { overview: { totalRewards: 0 } } }));
  await page.route('**/api/climate?**', (route) => route.fulfill({ json: {} }));
}

test('sign-in and switcher display identical dropdown content, row icons and styling', async ({ page }) => {
  await fixtures(page);
  // Old removal notices must not add page-specific content to the dropdown.
  await page.addInitScript(() => localStorage.setItem('eno-removed-customers', JSON.stringify([{ id: 'removed', name: 'Removed Person' }])));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const signIn = page.locator('.customer-dropdown');
  await expect(signIn.locator('.account-name strong')).toHaveText(['Maya Chen', 'Demo Tester', 'Future Person']);
  await expect(signIn.getByRole('button', { name: /^Delete / })).toHaveCount(0);
  await expect(signIn.locator('.delete-customer')).toHaveCount(0);
  const appearance = (element: Element) => {
    const style = getComputedStyle(element);
    return { width: style.width, padding: style.padding, borderRadius: style.borderRadius, font: style.font, background: style.backgroundColor };
  };
  const signInStyle = await signIn.evaluate(appearance);
  const signInText = await signIn.innerText();
  const signInIcons = await signIn.locator('.account-choice svg path').evaluateAll((paths) => paths.map((path) => path.getAttribute('d')));
  await expect(signIn.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: /Maya Chen/ }).click();
  await expect(page.locator('.profile-name')).toHaveText('Maya');
  await expect(page.getByRole('img', { name: 'Demo credit score: 762 out of 850, Very good', exact: true })).toBeVisible();
  await page.locator('.profile').click();
  const switcher = page.getByRole('menu', { name: 'Switch account' });
  await expect(switcher.locator('.account-name strong')).toHaveText(['Maya Chen', 'Demo Tester', 'Future Person']);
  expect(await switcher.evaluate(appearance)).toEqual(signInStyle);
  expect(await switcher.innerText()).toBe(signInText);
  expect(await switcher.locator('.account-choice svg path').evaluateAll((paths) => paths.map((path) => path.getAttribute('d')))).toEqual(signInIcons);
  await expect(switcher.getByRole('menuitem', { name: /^Delete / })).toHaveCount(0);
  await expect(switcher.locator('.delete-customer')).toHaveCount(0);
});

for (const view of ['dashboard', 'chat']) {
  test(`${view} refresh keeps the switched profile and updates a stale customer URL`, async ({ page }) => {
    await fixtures(page);
    await page.goto(`/${view}?customer=maya`);
    await expect(page.locator('.profile-name')).toHaveText('Maya');
    await page.locator('.profile').click();
    await page.getByRole('menuitemradio', { name: /Future Person/ }).click();
    await expect(page.locator('.profile-name')).toHaveText('Future');
    await expect(page).toHaveURL(new RegExp(`/${view}\\?customer=future$`));
    await page.reload();
    await expect(page.locator('.profile-name')).toHaveText('Future');
    await page.locator('.profile').click();
    await expect(page.getByRole('menuitemradio', { name: /Future Person/ })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    // A lost server session must still restore the last chosen profile.
    await page.route('**/api/session', (route) => route.fulfill({ json: { customer: null, accounts: [] } }));
    await page.goto(`/${view}`);
    await expect(page.locator('.profile-name')).toHaveText('Future');
    await expect(page).toHaveURL(new RegExp(`/${view}\\?customer=future$`));
  });
}

test('an explicit profile link takes precedence over the remembered selection', async ({ page }) => {
  await fixtures(page);
  await page.goto('/dashboard?customer=future');
  await expect(page.locator('.profile-name')).toHaveText('Future');
  await page.goto('/dashboard?customer=demo');
  await expect(page.locator('.profile-name')).toHaveText('Demo');
  await page.reload();
  await expect(page.locator('.profile-name')).toHaveText('Demo');
});

test('switcher fits on mobile and follows dark mode', async ({ page }) => {
  await fixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard?customer=maya');
  await expect(page.locator('.profile-name')).toHaveText('Maya');
  await page.locator('.theme-toggle').click();
  await page.locator('.profile').click();
  await expect(page.locator('.customer-dropdown')).toHaveClass(/dark/);
  await expect(page.getByRole('menuitemradio', { name: /Maya Chen/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a removed remembered profile falls back to Maya and repairs the URL', async ({ page }) => {
  await fixtures(page);
  await page.goto('/dashboard?customer=future');
  await expect(page.locator('.profile-name')).toHaveText('Future');
  await page.route('**/api/customers', (route) => route.fulfill({ json: { customers: [demo, maya] } }));
  await page.route('**/api/customers?customer=future', (route) => route.fulfill({ json: { customers: [] } }));
  await page.reload();
  await expect(page.locator('.profile-name')).toHaveText('Maya');
  await expect(page).toHaveURL(/\/dashboard\?customer=maya$/);
  await page.reload();
  await expect(page.locator('.profile-name')).toHaveText('Maya');
});


test('wallet navigation keeps the customer and restores card tabs from the URL', async ({ page }) => {
  await fixtures(page);
  const card = {
    id: 'credit',
    customerId: future.id,
    nickname: 'Future Rewards',
    type: 'Credit Card',
    accountNumber: '5678',
    balance: 50,
    rewards: 120
  };
  await page.route('**/api/accounts', (route) => route.fulfill({
    json: { customer: future, accounts: [card] }
  }));
  await page.route('**/api/accounts/credit', (route) => route.fulfill({
    json: {
      customer: future,
      account: card,
      transactions: [
        { id: 'purchase', kind: 'withdrawal', description: 'Coffee shop', amount: 4, date: '2026-11-01', status: 'completed' }
      ]
    }
  }));

  await page.goto('/dashboard?customer=future');
  await expect(page.locator('.profile-name')).toHaveText('Future');
  await page.getByRole('textbox', { name: 'Ask Capital One' }).focus();
  await expect(page).toHaveURL(/\/chat\?customer=future$/);
  await page.getByRole('link', { name: 'Return to dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard\?customer=future$/);
  const climateLink = page.getByRole('link', { name: 'Check your LORAX® score' });
  await expect(climateLink).toHaveAttribute('href', '/climatewise?customer=future');
  await climateLink.click();
  // A plain click opens Eno chat and sends the starter prompt; the href above
  // remains the fallback for modifier and middle clicks.
  await expect(page).toHaveURL(/\/chat\?customer=future$/);
  await expect(page.locator('.bubble.user')).toContainText('What is my ClimateWise score?');
  await page.getByRole('link', { name: 'Return to dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard\?customer=future$/);

  const dashboardCard = page.locator('article.account', { hasText: card.nickname });
  await dashboardCard.getByRole('button', { name: 'View activity' }).click();
  await expect(page).toHaveURL(/\/dashboard\?customer=future&account=credit&tab=activity$/);
  const accountView = page.locator('.view-shell');
  await expect(accountView.getByRole('button', { name: /Coffee shop/ })).toBeVisible();
  await expect(accountView.locator('.tabs button')).toHaveCount(4);
  await page.goBack();
  await expect(accountView).toBeHidden();
  await page.goForward();
  await expect(accountView.getByRole('button', { name: /Coffee shop/ })).toBeVisible();

  await accountView.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\?customer=future&account=credit&tab=details$/);
  await page.reload();
  await expect(accountView.getByRole('button', { name: 'Delete account' })).toBeVisible();
  await accountView.getByRole('button', { name: 'Back to dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard\?customer=future$/);

  await dashboardCard.getByRole('button', { name: 'Account settings' }).click();
  await expect(page).toHaveURL(/\/dashboard\?customer=future&account=credit&tab=details$/);
  await page.goto('/dashboard?customer=future&account=credit&txn=purchase');
  await expect(accountView.locator('[data-transaction-id="purchase"]')).toHaveClass(/highlight/);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(accountView.getByRole('searchbox', { name: 'Search transactions' })).toBeVisible();
  expect(await accountView.evaluate((view) => view.scrollWidth)).toBeLessThanOrEqual(390);
});
