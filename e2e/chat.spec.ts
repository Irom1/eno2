import { expect, test, type Page } from '@playwright/test';
import {
  askChat,
  assistantText,
  cardShells,
  cardText,
  cardTitles,
  collectErrors,
  expectCardCount,
  expectCardStyle,
  expectNoCardValueDuplicate,
  expectNoErrors,
  waitForChatSettled
} from './helpers';

const OVERVIEW_KINDS = ['Overview', 'Accounts', 'Rewards', 'Cashflow'];

async function loadChat(page: Page): Promise<void> {
  await page.goto('/chat');
  await expect(page.locator('textarea[aria-label="Ask Capital One"]')).toBeVisible({
    timeout: 30_000
  });
  await expect(page.locator('.profile-name')).toHaveText('Maya', { timeout: 30_000 });
}

async function runPrompt(page: Page, prompt: string): Promise<void> {
  await loadChat(page);
  await askChat(page, prompt);
}

/** Every title must be one of the supplied product labels. */
function expectTitlesWithin(titles: string[], allowed: string[]): void {
  for (const title of titles) {
    expect(allowed, `unexpected card title "${title}"`).toContain(title);
  }
}

test.describe('chat prompts', () => {
  test('"Show me my loans" renders exactly one Loans card', async ({ page }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Show me my loans');

    await expectCardCount(page, 1);

    const titles = await cardTitles(page);
    expect(titles).toEqual(['Loans']);
    expectTitlesWithin(titles, ['Loans']);

    const text = await cardText(page);
    expect(text).toContain('Loans');
    expect(text).not.toMatch(/No loans/i);
    for (const forbidden of ['Overview', 'Accounts', 'Rewards', 'Cashflow']) {
      expect(titles).not.toContain(forbidden);
    }

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('follow-up chips send a new prompt in one click', async ({ page }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Show me my loans');

    await expectCardCount(page, 1);
    expect(await cardTitles(page)).toEqual(['Loans']);

    const chips = page.locator('.follow-up');
    await expect(chips.first()).toBeVisible({ timeout: 20_000 });
    const labels = (await chips.allInnerTexts()).map((label) => label.trim());
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(
      labels.some((label) => label.toLowerCase() === 'show me my loans'),
      `follow-ups should not repeat the asked prompt, got ${JSON.stringify(labels)}`
    ).toBe(false);

    const turnsBefore = await page.locator('.assistant-turn').count();
    const chatResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/chat') && response.request().method() === 'POST',
      { timeout: 55_000 }
    );
    await page.getByRole('button', { name: 'Show me my bills', exact: true }).click();

    // Chips belong to the latest settled turn, so they disappear as soon as the
    // clicked prompt starts a new pending turn.
    await expect
      .poll(
        async () => {
          const pendingVisible = await page
            .locator('.chat-log .status-line')
            .isVisible()
            .catch(() => false);
          return pendingVisible && (await chips.count()) === 0;
        },
        { timeout: 20_000 }
      )
      .toBe(true);

    const response = await chatResponse;
    expect(response.status(), 'follow-up chat request should succeed').toBeLessThan(400);
    await response.finished().catch(() => undefined);
    await waitForChatSettled(page);

    await expect(page.locator('.assistant-turn')).toHaveCount(turnsBefore + 1);
    await expect.poll(() => cardTitles(page), { timeout: 20_000 }).toContain('Bills');

    const titles = await cardTitles(page);
    expect(titles.filter((title) => title === 'Loans')).toHaveLength(1);
    expect(titles).toContain('Bills');
    expect(titles).not.toContain('Overview');

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('"Show me my bills" renders one Bills card and no duplicated totals', async ({ page }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Show me my bills');

    await expectCardCount(page, { min: 1, max: 1 });
    const titles = await cardTitles(page);
    expect(titles).toEqual(['Bills']);
    expectTitlesWithin(titles, ['Bills']);
    expect(titles).not.toContain('Overview');

    await expectNoCardValueDuplicate(page, ['$4,283.59', '$65.59']);
    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('"Show me my recent transactions" renders a transactions card', async ({ page }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Show me my recent transactions');

    await expectCardCount(page, { min: 1 });
    const titles = await cardTitles(page);
    expect(
      titles.some((title) =>
        ['Transactions', 'Transaction', 'Deposits', 'Withdrawals'].includes(title)
      ),
      `expected a transactions-style card, got ${JSON.stringify(titles)}`
    ).toBe(true);
    expect(titles).not.toContain('Overview');

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('"Show me my credit card rewards" shows rewards without repeating values', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Show me my credit card rewards');

    await expectCardCount(page, { min: 1 });
    const titles = await cardTitles(page);
    const text = await cardText(page);
    const mentionsVenture = /Venture/i.test(text);
    const hasRewardsTitle = titles.includes('Rewards');
    expect(
      hasRewardsTitle || mentionsVenture,
      `expected a rewards card or Venture account card, got ${JSON.stringify(titles)}`
    ).toBe(true);

    await expectNoCardValueDuplicate(page, ['24,850', '$862']);
    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('"What credit cards do I have?" lists only credit-card accounts', async ({ page }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'What credit cards do I have?');

    await expectCardCount(page, { min: 1 });
    const titles = await cardTitles(page);
    const text = await cardText(page);

    expect(text, `expected a Venture card, got ${JSON.stringify(titles)}`).toMatch(/Venture/i);
    expect(text).not.toContain('Everyday Checking');
    expect(text).not.toContain('Emergency Fund');

    // A list card must be labelled for credit cards, never the generic all-accounts title.
    if (titles.some((title) => title === 'Accounts' || title === 'Credit cards')) {
      expect(titles).toContain('Credit cards');
      expect(titles).not.toContain('Accounts');
    }

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('"Show me my recurring payments" renders one Recurring payments card', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Show me my recurring payments');

    await expectCardCount(page, { min: 1, max: 1 });
    const titles = await cardTitles(page);
    expect(titles).toEqual(['Recurring payments']);

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('"Where did my money go last month?" renders one Spending card', async ({ page }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Where did my money go last month?');

    await expectCardCount(page, { min: 1, max: 1 });
    const titles = await cardTitles(page);
    expect(titles).toEqual(['Spending']);

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('"Anything weird in my transactions?" renders product-language anomalies', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Anything weird in my transactions?');

    await expectCardCount(page, { min: 1, max: 1 });
    const titles = await cardTitles(page);
    expect(titles).toEqual(['Worth a look']);

    const text = await cardText(page);
    expect(text).toMatch(/Possible duplicate|Unusual amount/);

    const combined = `${text}\n${await assistantText(page)}`;
    for (const jargon of ['outlier', 'median', 'threshold']) {
      expect(combined.toLowerCase()).not.toContain(jargon);
    }

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('"Find an ATM near Arlington" renders a location card with Arlington', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Find an ATM near Arlington');

    await expectCardCount(page, { min: 1, max: 1 });
    const titles = await cardTitles(page);
    expect(
      titles.some((title) => ['Locations', 'ATMs & branches', 'ATMs', 'Branches'].includes(title)),
      `expected a locations card, got ${JSON.stringify(titles)}`
    ).toBe(true);

    const text = await cardText(page);
    expect(text).toContain('Arlington');

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('"Give me a snapshot of my finances" renders an Overview card (max 4)', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Give me a snapshot of my finances');

    await expectCardCount(page, { min: 1, max: 4 });
    const titles = await cardTitles(page);
    expect(titles).toContain('Overview');
    expectTitlesWithin(titles, OVERVIEW_KINDS);

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('profile questions return a customer card or text answer', async ({ page }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Show me my profile');

    await expect
      .poll(
        async () =>
          (await cardShells(page).count()) > 0 || (await assistantText(page)).trim().length > 0,
        { timeout: 20_000 }
      )
      .toBe(true);

    const titles = await cardTitles(page);
    const text = await cardText(page);
    const prose = await assistantText(page);
    const hasCustomerCard = titles.some((title) => /Account holder/i.test(title));
    const mentionsMaya = /Maya/i.test(text) || /Maya/i.test(prose);
    expect(
      hasCustomerCard || mentionsMaya || prose.trim().length > 0,
      'profile prompt should produce an account-holder card or a text answer'
    ).toBe(true);

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('"Hello! What can you do?" does not crash', async ({ page }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Hello! What can you do?');

    await expect(page.locator('.dashboard')).toBeVisible();
    await expect(page.locator('textarea[aria-label="Ask Capital One"]')).toBeVisible();

    // A greeting may be answered with prose, cards, or both; it must settle.
    const rendered =
      (await assistantText(page)).trim().length > 0 || (await cardShells(page).count()) > 0;
    expect(rendered, 'greeting should produce a visible assistant response').toBe(true);

    await expectCardStyle(page);
    expectNoErrors(errors);
  });
});

test.describe('Eno mascot', () => {
  test('Eno mascot renders and animates through wave, open, reach while thinking', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    const emptyMascot = page.locator('.empty-state .eno-thinking');
    await expect(emptyMascot).toBeVisible();
    const emptyFrame = emptyMascot.locator('img[data-visible="true"]');
    await expect(emptyFrame).toHaveAttribute('src', /\/eno\/eno-light-wave\.png$/);
    await expect
      .poll(
        async () =>
          emptyFrame.evaluate((img) => (img as HTMLImageElement).naturalWidth),
        { timeout: 10_000 }
      )
      .toBe(1000);

    // Slow the chat request enough for the pending mascot animation to run.
    await page.route('**/api/chat', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    // Record the visible pose every time the thinking row or its layers change.
    await page.evaluate(() => {
      const target = window as unknown as { __enoFrames?: string[] };
      target.__enoFrames = [];
      const log = document.querySelector('.chat-log');
      if (!log) return;
      const record = (): void => {
        const img = document.querySelector('.thinking-row img[data-visible="true"]');
        const pose = img?.getAttribute('data-pose');
        if (!pose) return;
        const frames = target.__enoFrames!;
        if (!frames.includes(pose)) frames.push(pose);
      };
      const observer = new MutationObserver(record);
      observer.observe(log, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-visible']
      });
      record();
    });

    const composer = page.locator('textarea[aria-label="Ask Capital One"]');
    await expect(composer).toBeVisible();
    await composer.fill('Show me my loans');
    const send = page.locator('button.send[aria-label="Ask"]');
    await expect(send).toBeEnabled({ timeout: 30_000 });

    const chatResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/chat') && response.request().method() === 'POST',
      { timeout: 55_000 }
    );
    await composer.press('Enter');

    const thinkingRow = page.locator('.thinking-row');
    await expect(thinkingRow).toBeVisible({ timeout: 20_000 });
    await expect(thinkingRow.locator('.eno-thinking')).toBeVisible();

    const response = await chatResponse;
    expect(response.status(), 'chat request should succeed').toBeLessThan(400);
    await response.finished().catch(() => undefined);
    await waitForChatSettled(page);

    const frames = await page.evaluate(
      () => (window as unknown as { __enoFrames?: string[] }).__enoFrames ?? []
    );
    expect(frames.slice(0, 3), `recorded poses: ${JSON.stringify(frames)}`).toEqual([
      'wave',
      'open',
      'reach'
    ]);

    await expect(thinkingRow).toHaveCount(0);
    expectNoErrors(errors);
  });

  test('Eno mascot follows the active theme', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/chat');

    const headerMascot = page.locator('.chat-heading .eno-thinking');
    await expect(headerMascot).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.chat-heading h2')).toHaveText('Eno 2.0');
    await expect(page.locator('.profile-name')).toHaveText('Maya', { timeout: 30_000 });

    await page.locator('button[aria-label="Switch to dark mode"]').click();
    await expect(page.locator('.dashboard')).toHaveAttribute('data-theme', 'dark');

    await expect(headerMascot.locator('img[data-visible="true"]')).toHaveAttribute(
      'src',
      /\/eno\/eno-navy-wave\.png$/
    );

    expectNoErrors(errors);
  });
});

