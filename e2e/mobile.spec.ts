import { expect, test, type Page } from '@playwright/test';
import {
  askChat,
  cardShells,
  cardTitles,
  collectErrors,
  expectCardCount,
  expectNoErrors
} from './helpers';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true
});

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth
    };
  });
  expect(
    overflow.scrollWidth,
    `horizontal overflow: scrollWidth ${overflow.scrollWidth} > innerWidth ${overflow.innerWidth}`
  ).toBeLessThanOrEqual(overflow.innerWidth + 1);
}

test.describe('iPhone 13 viewport', () => {
  test('dashboard fits, switcher/theme work, and account view opens and closes', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await page.goto('/dashboard');
    await expect(page.locator('article.account').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.profile-name')).toHaveText('Maya', { timeout: 30_000 });

    await expectNoHorizontalOverflow(page);

    await expect(page.locator('.profile')).toBeVisible();
    await expect(page.locator('.theme-toggle')).toBeVisible();

    // Account switcher opens on mobile.
    await page.locator('.profile').click();
    await expect(page.locator('.account-dropdown')).toBeVisible();
    await expect(page.locator('.account-dropdown')).toContainText('Jordan Lee');
    await page.keyboard.press('Escape');
    await expect(page.locator('.account-dropdown')).toBeHidden();

    // Open the checking account view and close it with back.
    const checking = page.locator('article.account', { hasText: 'Everyday Checking' });
    await checking.getByRole('button', { name: /View activity/i }).click();
    const shell = page.locator('.view-shell');
    await expect(shell).toBeVisible({ timeout: 20_000 });
    await expect(shell.locator('.hero')).toContainText('Everyday Checking');
    await expectNoHorizontalOverflow(page);

    await page.locator('.back-button[aria-label="Back to dashboard"]').click();
    await expect(shell).toBeHidden();

    expectNoErrors(errors);
  });

  test('chat fits and returns exactly one Loans card', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/chat');
    await expect(page.locator('textarea[aria-label="Ask Capital One"]')).toBeVisible({
      timeout: 30_000
    });
    await expect(page.locator('.profile-name')).toHaveText('Maya', { timeout: 30_000 });
    await expectNoHorizontalOverflow(page);

    await askChat(page, 'Show me my loans');
    await expectCardCount(page, 1);
    expect(await cardTitles(page)).toEqual(['Loans']);

    await expectNoHorizontalOverflow(page);
    expectNoErrors(errors);
  });
});
