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
  test('loads live accounts with no errors', async ({ page }) => {
    const errors = collectErrors(page);
    await loadDashboard(page);

    const cards = page.locator('article.account');
    await expect(cards).toHaveCount(3);
    await expect(page.locator('.account-overview')).toContainText('Everyday Checking');
    await expect(page.locator('.account-overview')).toContainText('Emergency Fund');
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
    await expect(overview).not.toContainText('Everyday Checking');

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

  test('account detail view exposes activity, details, bills, and loans', async ({ page }) => {
    const errors = collectErrors(page);
    await loadDashboard(page);

    const checking = page.locator('article.account', { hasText: 'Everyday Checking' });
    await expect(checking).toBeVisible();
    await checking.getByRole('button', { name: /View activity/i }).click();

    const shell = page.locator('.view-shell');
    await expect(shell).toBeVisible({ timeout: 20_000 });
    await expect(shell.locator('.hero')).toContainText('Everyday Checking');

    const tabs = shell.locator('.tabs .tab');
    await expect(tabs).toContainText(['Activity', 'Details', 'Bills', 'Loans']);

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

    // Loans tab.
    await shell.locator('.tab', { hasText: 'Loans' }).click();
    const loansPanel = shell.locator('.tab-panel[aria-label="Loans"]');
    await expect(loansPanel).toBeVisible();
    await expect(loansPanel).toContainText('Auto Loan');
    await expect(loansPanel).toContainText('Student Loan');

    // Details tab, then back closes the view.
    await shell.locator('.tab', { hasText: 'Details' }).click();
    await expect(shell.locator('.tab-panel[aria-label="Details"]')).toBeVisible();

    await page.locator('.back-button[aria-label="Back to dashboard"]').click();
    await expect(shell).toBeHidden();

    expectNoErrors(errors);
  });

  test('home modules show recent activity, upcoming bills, and live rewards', async ({ page }) => {
    const errors = collectErrors(page);
    await loadDashboard(page);

    await expect(page.locator('.activity-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.activity-panel')).toContainText('Recent activity');
    await expect(page.locator('.activity-panel .activity-row').first()).toBeVisible();

    await expect(page.locator('.bills-panel')).toBeVisible();
    await expect(page.locator('.bills-panel')).toContainText('Upcoming bills');
    await expect(page.locator('.bills-panel .bill-row').first()).toBeVisible();

    await expect(page.locator('.feature.reward .reward-amount')).toContainText('pts');
    const points = await page.locator('.feature.reward .reward-amount').innerText();
    expect(Number(points.replace(/[^\d]/g, ''))).toBeGreaterThan(0);

    expectNoErrors(errors);
  });
});
