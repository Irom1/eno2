import { expect, test, type Page } from '@playwright/test';
import {
  askChat,
  cardShells,
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
    const checking = page.locator('article.account', { hasText: '360 Checking' });
    await checking.getByRole('button', { name: /View activity/i }).click();
    const shell = page.locator('.view-shell');
    await expect(shell).toBeVisible({ timeout: 20_000 });
    await expect(shell.locator('.hero')).toContainText('360 Checking');
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
    await expect(page.locator('.loan-card')).toHaveCount(1);
    await expect(page.locator('.loan-card')).toHaveAttribute('data-kind', 'loan');

    await expectNoHorizontalOverflow(page);
    expectNoErrors(errors);
  });

  test('locks pinch/double-tap zoom and keeps 16px mobile fields', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/chat');
    const composer = page.locator('textarea[aria-label="Ask Capital One"]');
    await expect(composer).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.profile-name')).toHaveText('Maya', { timeout: 30_000 });

    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('maximum-scale=1');
    expect(viewport).toContain('user-scalable=no');

    const touch = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).touchAction,
      body: getComputedStyle(document.body).touchAction
    }));
    for (const value of [touch.html, touch.body]) {
      expect(value).toContain('pan-x');
      expect(value).toContain('pan-y');
    }

    const gesturesPrevented = await page.evaluate(() => {
      const results: boolean[] = [];
      for (const name of ['gesturestart', 'gesturechange']) {
        const event = new Event(name, { bubbles: true, cancelable: true });
        document.dispatchEvent(event);
        results.push(event.defaultPrevented);
      }
      return results;
    });
    expect(gesturesPrevented).toEqual([true, true]);

    const fontSize = await composer.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize)
    );
    expect(fontSize).toBeGreaterThanOrEqual(16);

    await expectNoHorizontalOverflow(page);
    expectNoErrors(errors);
  });
});
