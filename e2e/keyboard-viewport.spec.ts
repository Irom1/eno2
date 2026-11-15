import { expect, test } from '@playwright/test';
import { emptyAnswers } from '../src/lib/signup';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

for (const path of ['/setup', '/setup?mode=accounts&customer=keyboard-test', '/chat?customer=keyboard-test']) {
  test(`${path} follows the visible keyboard edge and restores document layout`, async ({ page }) => {
    const customer = { id: 'keyboard-test', firstName: 'Ada', lastName: 'Lovelace' };
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      let json: unknown = {};
      if (url.pathname === '/api/customers') json = { customers: [customer] };
      if (url.pathname === '/api/session' || url.pathname === '/api/accounts') json = { customer, accounts: [], bills: [], transactions: [] };
      if (url.pathname === '/api/accounts/open') json = { customer, available: [{ id: 'checking', label: 'Checking' }] };
      if (url.pathname === '/api/signup/chat') json = {
        message: 'Welcome! What is your full name?', answers: emptyAnswers(),
        accountChoice: 'undecided', spending: { status: 'skip', categories: [] },
        includeCreditCard: null, stage: 'details', ready: false, confirmed: false
      };
      await route.fulfill({ json });
    });
    await page.goto(path);
    const area = page.locator('.composer-area');
    const field = area.locator('input, textarea').first();
    await expect(field).toBeEnabled();
    await field.focus();

    // Exercise actual resize/scroll listeners, including Safari's focus pan and
    // a landscape-sized visible area smaller than the old 320px floor.
    for (const { height, offsetTop } of [
      { height: 360, offsetTop: 0 },
      { height: 360, offsetTop: 84 },
      { height: 240, offsetTop: 30 }
    ]) {
      await page.evaluate(({ height, offsetTop }) => {
        Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: height });
        Object.defineProperty(window.visualViewport, 'offsetTop', { configurable: true, value: offsetTop });
        window.visualViewport?.dispatchEvent(new Event('resize'));
        window.visualViewport?.dispatchEvent(new Event('scroll'));
      }, { height, offsetTop });
      await expect(area).toHaveClass(/keyboard-composer/);
      await expect.poll(() => area.evaluate((element) => element.getBoundingClientRect().bottom))
        .toBeCloseTo(height + offsetTop, 0);
      const formBottom = await area.locator('form').evaluate((element) => element.getBoundingClientRect().bottom);
      expect(formBottom).toBeCloseTo(height + offsetTop - 12, 0);
      const spacing = await area.evaluate((element) => ({
        reserved: (element.previousElementSibling as HTMLElement).offsetHeight,
        composer: element.getBoundingClientRect().height,
        layout: window.innerHeight
      }));
      expect(spacing.reserved).toBeCloseTo(spacing.composer + spacing.layout - height - offsetTop, 0);
    }

    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: window.innerHeight });
      Object.defineProperty(window.visualViewport, 'offsetTop', { configurable: true, value: 0 });
      window.visualViewport?.dispatchEvent(new Event('resize'));
    });
    await expect(area).not.toHaveClass(/keyboard-composer/);
    expect(await area.evaluate((element) => getComputedStyle(element).position)).toBe('sticky');
    expect(await area.evaluate((element) => (element.previousElementSibling as HTMLElement).offsetHeight)).toBe(0);
  });
}
