import { expect, test, type Page } from '@playwright/test';
import {
  JORDAN,
  MAYA,
  collectErrors,
  expectNoErrors
} from './helpers';

async function loadDashboard(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await expect(page.locator('article.account').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.profile-name')).toHaveText(MAYA.first, { timeout: 30_000 });
}

test.describe('dashboard', () => {
  test('closes a profile without accounts from Your tools', async ({ page }) => {
    const customer = { id: 'demo-customer', firstName: 'Demo', lastName: 'Customer' };
    let closed = false;
    let requests = 0;
    await page.route('**/api/customers', (route) =>
      route.fulfill({ json: { customers: closed ? [] : [customer] } }));
    await page.route('**/api/session', (route) => route.fulfill({ json: { customer } }));
    await page.route('**/api/accounts', (route) => route.fulfill({ json: { customer, accounts: [] } }));
    await page.route('**/api/overview', (route) => route.fulfill({ json: {} }));
    await page.route('**/api/profile', (route) => {
      expect(route.request().method()).toBe('DELETE');
      expect(route.request().postDataJSON()).toEqual({ customerId: customer.id });
      requests++;
      if (requests === 1) return route.fulfill({ status: 502, json: { error: 'Could not confirm closure.' } });
      closed = true;
      return route.fulfill({ status: 204 });
    });

    await page.goto('/dashboard');
    const tools = page.getByRole('region', { name: 'Your tools' });
    const close = tools.getByRole('button', { name: 'Close profile' });
    const dialog = page.getByRole('dialog', { name: 'Close profile?' });
    await close.click();
    await expect(dialog).toContainText('Demo Customer');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(requests).toBe(0);

    await close.click();
    await dialog.getByRole('button', { name: 'Close profile' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Could not confirm closure.');
    await dialog.getByRole('button', { name: 'Close profile' }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(requests).toBe(2);
  });

  test('deletes only the confirmed account from settings', async ({ page }) => {
    const customer = { id: 'demo-customer', firstName: 'Demo', lastName: 'Customer' };
    const checking = { id: 'checking', customerId: customer.id, nickname: '360 Checking', type: 'Checking', accountNumber: '1234', balance: 10, rewards: 0 };
    const savings = { ...checking, id: 'savings', nickname: '360 Performance Savings', type: 'Savings', accountNumber: '5678' };
    let deletes = 0;
    let deleted = false;

    await page.route('**/api/customers', (route) => route.fulfill({ json: { customers: [customer] } }));
    await page.route('**/api/session', (route) => route.fulfill({ json: { customer } }));
    await page.route('**/api/overview', (route) => route.fulfill({ json: {} }));
    await page.route('**/api/accounts', (route) => route.fulfill({
      json: { customer, accounts: deleted ? [savings] : [checking, savings] }
    }));
    await page.route('**/api/accounts/checking', (route) => {
      if (route.request().method() === 'DELETE') {
        deletes++;
        if (deletes === 1) return route.fulfill({ status: 502, json: { error: 'Unavailable' } });
        deleted = true;
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ json: { account: checking, customer } });
    });

    await page.goto('/dashboard');
    const card = page.locator('article.account', { hasText: checking.nickname });
    await card.getByRole('button', { name: 'View activity' }).click();
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Account details' });
    const openDelete = settings.getByRole('button', { name: 'Delete account', exact: true });
    const confirmation = page.getByRole('dialog', { name: 'Delete account?' });

    await openDelete.click();
    await expect(confirmation).toContainText('360 Checking ending in 1234');
    await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirmation).toBeHidden();
    await expect(openDelete).toBeFocused();
    expect(deletes).toBe(0);

    await openDelete.click();
    await confirmation.getByRole('button', { name: 'Delete account', exact: true }).click();
    await expect(confirmation.getByRole('alert')).toContainText("couldn't confirm");
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(settings).toBeVisible();

    await openDelete.click();
    await confirmation.getByRole('button', { name: 'Delete account', exact: true }).click();
    await expect(settings).toBeHidden();
    await expect(page.getByRole('status')).toHaveText('Account deleted.');
    await expect(card).toHaveCount(0);
    await expect(page.locator('article.account', { hasText: savings.nickname })).toBeVisible();
    expect(deletes).toBe(2);
  });

  test('loads live accounts with no errors', async ({ page }) => {
    const errors = collectErrors(page);
    await loadDashboard(page);

    const cards = page.locator('article.account');
    await expect(cards).toHaveCount(3);
    await expect(page.locator('.account-overview')).toContainText('360 Checking');
    await expect(page.locator('.account-overview')).toContainText('360 Performance Savings');
    await expect(page.locator('.account-overview')).toContainText('Venture Rewards');

    expectNoErrors(errors);
  });

  test('account switcher shows both customers and switches to Jordan', async ({ page }) => {
    const errors = collectErrors(page);
    await loadDashboard(page);

    await page.locator('.profile').click();
    const dropdown = page.locator('.account-dropdown');
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toContainText('Maya Chen');
    await expect(dropdown).toContainText('Jordan Lee');

    await dropdown.locator('.account-option', { hasText: 'Jordan Lee' }).click();

    await expect(page.locator('.profile-name')).toHaveText(JORDAN.first, { timeout: 30_000 });
    const overview = page.locator('.account-overview');
    await expect(overview).toContainText('Spending', { timeout: 30_000 });
    await expect(overview).toContainText('Quicksilver', { timeout: 30_000 });
    await expect(overview).not.toContainText('360 Checking');

    expectNoErrors(errors);
  });

  test('theme toggle flips data-theme and persists in localStorage', async ({ page }) => {
    const errors = collectErrors(page);
    await loadDashboard(page);

    const dashboard = page.locator('.dashboard');
    const before = await dashboard.getAttribute('data-theme');
    expect(before).toBeTruthy();

    await page.locator('.theme-toggle').click();
    const after = await dashboard.getAttribute('data-theme');
    expect(after).not.toBe(before);
    expect(await page.evaluate(() => localStorage.getItem('dashboard-theme'))).toBe(after);

    await page.locator('.theme-toggle').click();
    const restored = await dashboard.getAttribute('data-theme');
    expect(restored).not.toBe(after);
    expect(await page.evaluate(() => localStorage.getItem('dashboard-theme'))).toBe(restored);

    expectNoErrors(errors);
  });

  test('account detail view exposes activity, details, and bills', async ({ page }) => {
    const errors = collectErrors(page);
    await loadDashboard(page);

    const checking = page.locator('article.account', { hasText: '360 Checking' });
    await expect(checking).toBeVisible();
    await checking.getByRole('button', { name: /View activity/i }).click();

    const shell = page.locator('.view-shell');
    await expect(shell).toBeVisible({ timeout: 20_000 });
    await expect(shell.locator('.hero')).toContainText('360 Checking');

    const tabs = shell.locator('.tabs .tab');
    await expect(tabs).toHaveText([/^Activity/, /^Details/, /^Bills/]);

    // Activity: live transaction rows, then the detail sheet.
    const rows = shell.locator('.tx-row');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    const activityText = await shell.locator('.tab-panel').innerText();
    expect(activityText).toMatch(/ACME|PAYROLL|EVERSOURCE/i);

    await rows.first().click();
    const sheet = page.locator('.sheet-card');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Transaction');
    await sheet.locator('.sheet-close').click();
    await expect(sheet).toBeHidden();

    // Bills tab: open and close a bill.
    await shell.locator('.tab', { hasText: 'Bills' }).click();
    const billsPanel = shell.locator('.tab-panel[aria-label="Bills"]');
    await expect(billsPanel).toBeVisible();
    const billRow = billsPanel.locator('.list-row').first();
    await expect(billRow).toBeVisible({ timeout: 20_000 });
    await billRow.click();
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Bill');
    await sheet.locator('.sheet-close').click();
    await expect(sheet).toBeHidden();

    // Details tab, then back closes the view.
    await shell.locator('.tab', { hasText: 'Details' }).click();
    await expect(shell.locator('.tab-panel[aria-label="Details"]')).toBeVisible();

    await page.locator('.back-button[aria-label="Back to dashboard"]').click();
    await expect(shell).toBeHidden();

    expectNoErrors(errors);
  });

  test('home modules show recent activity and upcoming bills without a rewards tile', async ({ page }) => {
    const errors = collectErrors(page);
    await loadDashboard(page);

    await expect(page.locator('.activity-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.activity-panel')).toContainText('Recent activity');
    await expect(page.locator('.activity-panel .activity-row').first()).toBeVisible();

    await expect(page.locator('.bills-panel')).toBeVisible();
    await expect(page.locator('.bills-panel')).toContainText('Upcoming bills');
    await expect(page.locator('.bills-panel .bill-row').first()).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Explore rewards and benefits' })).toHaveCount(0);

    expectNoErrors(errors);
  });
});
