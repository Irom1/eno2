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
    await expect(page.locator('.account-dropdown')).toContainText('Demo Tester');
    await expect(page.locator('.account-dropdown')).toContainText('Maya Chen');
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

test.describe('360x640 keyboard viewport', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('uses the compact placeholder and keeps the composer above the keyboard', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await page.goto('/chat');
    const field = page.locator('textarea[aria-label="Ask Capital One"]');
    await expect(field).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.profile-name')).toHaveText('Maya', { timeout: 30_000 });

    await expect(field).toHaveAttribute('placeholder', 'Ask about your money…');
    await expectNoHorizontalOverflow(page);

    // The hidden auto-height mirror includes the placeholder, so the pill grows
    // instead of letting the wrapped placeholder spill.
    const mirror = await page.locator('.composer-field').evaluate((element) =>
      getComputedStyle(element, '::after').content
    );
    expect(mirror).toContain('Ask about your money');

    // Simulate the on-screen keyboard shrinking the visual viewport to 360px.
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--chat-viewport-height', '360px');
      document.documentElement.style.setProperty('--chat-viewport-offset', '0px');
      document.querySelector('.dashboard')?.classList.add('keyboard-open');
    });

    const bottom = await page
      .locator('.composer')
      .evaluate((element) => element.getBoundingClientRect().bottom);
    expect(bottom).toBeLessThanOrEqual(360);
    await expectNoHorizontalOverflow(page);
    expectNoErrors(errors);
  });

  test('renders the full ClimateWise card standalone within the viewport', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/chat');
    await expect(page.locator('textarea[aria-label="Ask Capital One"]')).toBeVisible({
      timeout: 30_000
    });
    await expect(page.locator('.profile-name')).toHaveText('Maya', { timeout: 30_000 });

    // Deterministic SSE: a full insight_climatewise report, no live model call.
    const report = {
      asOf: '2026-11-14',
      days: 90,
      totalKg: 412.4,
      totalSpend: 3000,
      purchaseCount: 42,
      kgPerDollar: 0.14,
      annualizedTonnes: 1.67,
      benchmarkTonnes: 16,
      targetTonnes: 2.5,
      score: 712,
      tier: 'Good',
      categories: [
        {
          id: 'transport',
          label: 'Travel & transport',
          color: '#c4562e',
          kg: 180.2,
          spend: 62,
          count: 3,
          share: 0.43,
          greenness: 0.3
        },
        {
          id: 'food',
          label: 'Food & dining',
          color: '#2f8f5b',
          kg: 120.5,
          spend: 400,
          count: 20,
          share: 0.29,
          greenness: 0.45
        }
      ],
      greenness: { ratings: [], greenShare: 0.42, flexibleSpend: 3200, fixedSpend: 1620 },
      topPurchases: [
        {
          id: 'tx-1',
          kind: 'withdrawal',
          amount: 62,
          description: 'SHELL',
          date: '2026-10-01',
          category: 'transport',
          kg: 120.2
        },
        {
          id: 'tx-2',
          kind: 'withdrawal',
          amount: 40,
          description: 'WHOLE FOODS MKT',
          date: '2026-10-03',
          category: 'food',
          kg: 60.5
        }
      ],
      nudges: [],
      equivalents: { milesDriven: 3120, treeSeedlings: 41 }
    };

    const events = [
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'Here is your ClimateWise snapshot.'
      })}`,
      `event: insight\ndata: ${JSON.stringify({
        type: 'insight',
        kind: 'insight_climatewise',
        payload: report
      })}`,
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'Small habit changes can lower your footprint.'
      })}`,
      `event: done\ndata: ${JSON.stringify({ type: 'done', sessionId: 'mobile-test-session' })}`
    ].join('\n\n');

    await page.route('**/api/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `${events}\n\n`
      });
    });

    await askChat(page, 'What is my ClimateWise score?');

    const card = page.locator('.climatewise-chat-card');
    await expect(card).toHaveCount(1, { timeout: 20_000 });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-kind', 'climatewise');

    // The full adaptive card, not a primitive summary.
    await expect(page.locator('.climatewise-card')).toHaveCount(0);
    await expect(card.locator('article.card')).toHaveCount(1);
    await expect(card.locator('.ring svg')).toBeVisible();
    await expect(card.locator('.list')).toBeVisible();
    await expect(card.locator('.ring .seg').first()).toBeVisible();

    // The category title sits in the purchases panel, not inside the chart.
    await expect(card.locator('#chart-title')).toHaveCount(1);
    await expect(card.locator('.list .chart-title')).toHaveText('Carbon emissions by category');
    await expect(card.locator('.chart .chart-title')).toHaveCount(0);

    // Standalone: never folded into the prose bubble.
    expect(
      await card.evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'the full climatewise card renders outside the prose bubble'
    ).toBe(false);
    await expect(page.locator('.bubble.assistant .climatewise-chat-card')).toHaveCount(0);

    // The 88% column cap keeps the card inside the viewport.
    const sizes = await card.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const container = element.closest('.assistant-content') as HTMLElement | null;
      return {
        cardWidth: rect.width,
        cardLeft: rect.left,
        cardRight: rect.right,
        containerWidth: container?.getBoundingClientRect().width ?? 0,
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth
      };
    });
    console.log('[360x640 climatewise]', JSON.stringify(sizes));
    expect(sizes.cardWidth).toBeLessThanOrEqual(sizes.innerWidth);
    expect(sizes.cardLeft).toBeGreaterThanOrEqual(0);
    expect(sizes.cardRight).toBeLessThanOrEqual(sizes.innerWidth);
    expect(
      sizes.cardWidth,
      `card width ${sizes.cardWidth} exceeds the 88% cap of ${sizes.containerWidth}`
    ).toBeLessThanOrEqual(sizes.containerWidth * 0.88 + 1);
    await expectNoHorizontalOverflow(page);

    // Ring/category pick reveals the report's purchase rows. The SVG donut's
    // centre is not a hit-testable part of the segment, so activate the
    // segment with the keyboard (same toggle handler as a tap).
    await card.getByRole('button', { name: /Travel & transport:/ }).press('Enter');
    await expect(card.locator('.list-head h2')).toHaveText('Travel & transport');
    await expect(card.locator('.items .item')).toHaveCount(1);
    await expect(card.locator('.items .item')).toContainText(/shell/i);
    await expectNoHorizontalOverflow(page);

    expectNoErrors(errors);
  });
});

test.describe('320x568 narrow phone viewport', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test('uses the compact placeholder and keeps the composer above the keyboard', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await page.goto('/chat');
    const field = page.locator('textarea[aria-label="Ask Capital One"]');
    await expect(field).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.profile-name')).toHaveText('Maya', { timeout: 30_000 });

    await expect(field).toHaveAttribute('placeholder', 'Ask about your money…');
    await expectNoHorizontalOverflow(page);

    const mirror = await page.locator('.composer-field').evaluate((element) =>
      getComputedStyle(element, '::after').content
    );
    expect(mirror).toContain('Ask about your money');

    // Simulate the on-screen keyboard shrinking the visual viewport to 320px.
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--chat-viewport-height', '320px');
      document.documentElement.style.setProperty('--chat-viewport-offset', '0px');
      document.querySelector('.dashboard')?.classList.add('keyboard-open');
    });

    const bounds = await page.locator('.composer').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width };
    });
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    }));
    console.log('[320x568 composer]', JSON.stringify({ mirror, bounds, ...overflow }));

    expect(bounds.bottom).toBeLessThanOrEqual(320);
    await expectNoHorizontalOverflow(page);
    expectNoErrors(errors);
  });
});
