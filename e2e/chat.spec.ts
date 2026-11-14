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
    await expect(page.locator('.chat-card .badge')).toHaveCount(0);

    const text = await cardText(page);
    expect(text).toContain('Loans');
    expect(text).not.toMatch(/No loans/i);
    for (const forbidden of ['Overview', 'Accounts', 'Rewards', 'Cashflow']) {
      expect(titles).not.toContain(forbidden);
    }

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('opens with one friendly intro and no chat request', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    const chatPosts: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/chat') && request.method() === 'POST') {
        chatPosts.push(request.url());
      }
    });

    await loadChat(page);

    const intro = page.locator('.assistant-turn.intro');
    await expect(intro).toBeVisible();
    await expect(intro).toHaveCount(1);
    const introText = (await intro.innerText()).toLowerCase();
    for (const phrase of ['eno 2.0', 'spending', 'bills', 'balances']) {
      expect(introText, `intro should mention ${phrase}`).toContain(phrase);
    }
    expect(chatPosts, 'the intro must not call the chat API').toEqual([]);
    await expect(page.locator('.shortcuts .prompt').first()).toBeVisible();
    await expect(page.locator('.follow-up')).toHaveCount(0);

    // The mascot sits to the left of the intro bubble, aligned near its top.
    const introAvatar = page.locator('.assistant-turn.intro .eno-thinking');
    const introBubble = page.locator('.assistant-turn.intro .bubble.assistant');
    await expect(introAvatar).toBeVisible();
    await expect(introBubble).toBeVisible();
    const introAvatarBox = await introAvatar.boundingBox();
    const introBubbleBox = await introBubble.boundingBox();
    expect(introAvatarBox, 'intro mascot should be laid out').not.toBeNull();
    expect(introBubbleBox, 'intro bubble should be laid out').not.toBeNull();
    expect(
      introAvatarBox!.x + introAvatarBox!.width,
      'intro mascot should sit left of the bubble'
    ).toBeLessThanOrEqual(introBubbleBox!.x + 1);
    expect(
      Math.abs(introAvatarBox!.y - introBubbleBox!.y),
      'intro mascot should align with the top of the bubble'
    ).toBeLessThan(20);

    await askChat(page, 'Show me my loans');

    await expect(page.locator('.assistant-turn.intro')).toHaveCount(1);
    expect(
      await page
        .locator('.assistant-turn')
        .first()
        .evaluate((element) => element.classList.contains('intro')),
      'intro stays the first assistant turn'
    ).toBe(true);
    await expect(page.locator('.assistant-turn')).toHaveCount(2);
    await expect(page.locator('.shortcuts')).toHaveCount(0);

    // The responder turn's mascot sits to the left of its content column.
    const responderTurn = page.locator('.assistant-turn').last();
    const responderAvatar = responderTurn.locator('.eno-thinking');
    const responderContent = responderTurn.locator('.assistant-content').first();
    await expect(responderAvatar).toBeVisible();
    const responderAvatarBox = await responderAvatar.boundingBox();
    const responderContentBox = await responderContent.boundingBox();
    expect(responderAvatarBox, 'responder mascot should be laid out').not.toBeNull();
    expect(responderContentBox, 'responder content should be laid out').not.toBeNull();
    expect(
      responderAvatarBox!.x + responderAvatarBox!.width,
      'responder mascot should sit left of its content'
    ).toBeLessThanOrEqual(responderContentBox!.x + 1);
    expect(
      Math.abs(responderAvatarBox!.y - responderContentBox!.y),
      'responder mascot should align with the top of its content'
    ).toBeLessThan(20);

    // Switching customers resets to exactly one fresh intro.
    await page.locator('.profile').click();
    const dropdown = page.locator('.account-dropdown');
    await expect(dropdown).toBeVisible();
    await dropdown.locator('.account-option', { hasText: 'Jordan Lee' }).click();
    await expect(page.locator('.profile-name')).toHaveText('Jordan', { timeout: 30_000 });
    await expect(page.locator('.assistant-turn.intro')).toHaveCount(1);
    await expect(page.locator('.assistant-turn')).toHaveCount(1);
    await expect(page.locator('.shortcuts .prompt').first()).toBeVisible();

    expectNoErrors(errors);
  });

  test('follow-up chips send a new prompt in one click', async ({ page }) => {
    test.setTimeout(120_000);
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

    expect(labels, 'follow-ups are capped at three').toHaveLength(3);

    // Follow-ups are the last content in the message list, below the final turn.
    const followupBox = await page.locator('.chat-followups').boundingBox();
    expect(followupBox, 'follow-up block should be laid out').not.toBeNull();

    const placement = await page.locator('.chat-followups').evaluate((element) => {
      const turns = Array.from(document.querySelectorAll('.assistant-turn'));
      const lastTurn = turns[turns.length - 1];
      return {
        inLog: element.closest('.chat-log') !== null,
        afterLastTurn:
          Boolean(lastTurn) &&
          Boolean(
            lastTurn!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
          )
      };
    });
    expect(placement, 'follow-ups belong inside the log after the last turn').toEqual({
      inLog: true,
      afterLastTurn: true
    });

    const rows = await chips.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { y: Math.round(rect.y), width: rect.width, height: rect.height };
      })
    );
    const innerWidth = await page.locator('.chat-followups').evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        element.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight)
      );
    });
    expect(new Set(rows.map((row) => row.y)).size, 'one suggestion per row').toBe(rows.length);
    for (const row of rows) {
      expect(row.width, 'each suggestion spans most of the log').toBeGreaterThan(
        innerWidth * 0.6
      );
      expect(row.height, 'follow-up rows stay compact').toBeLessThanOrEqual(40);
    }

    // Transparent rows with a trailing arrow that points the way forward.
    const rowStyles = await chips.evaluateAll((elements) =>
      elements.map((element) => {
        const arrow = element.querySelector('.follow-up-arrow');
        const label = element.querySelector('.follow-up-label');
        const arrowRect = arrow?.getBoundingClientRect();
        const labelRect = label?.getBoundingClientRect();
        return {
          background: getComputedStyle(element).backgroundColor,
          hasArrow: Boolean(arrow),
          arrowRightOfLabel: Boolean(
            arrowRect && labelRect && arrowRect.left >= labelRect.right
          )
        };
      })
    );
    expect(await page.locator('.follow-up-arrow').count()).toBe(3);
    for (const style of rowStyles) {
      expect(style.background, 'follow-up rows are transparent').toBe('rgba(0, 0, 0, 0)');
      expect(style.hasArrow, 'each row has a trailing arrow').toBe(true);
      expect(style.arrowRightOfLabel, 'arrow sits after the label').toBe(true);
    }

    const firstRow = chips.first();
    const firstArrow = firstRow.locator('.follow-up-arrow');
    expect(await firstArrow.evaluate((element) => getComputedStyle(element).transform)).toBe(
      'none'
    );
    await firstRow.hover();
    const readTranslateX = (element: Element): number => {
      const matrix = /matrix\(([^)]+)\)/.exec(getComputedStyle(element).transform);
      return Number.parseFloat((matrix?.[1] ?? '').split(',')[4] ?? '0');
    };
    await expect
      .poll(() => firstArrow.evaluate(readTranslateX))
      .toBeGreaterThanOrEqual(2);
    const translateX = await firstArrow.evaluate(readTranslateX);
    expect(translateX).toBeGreaterThanOrEqual(2);
    expect(translateX).toBeLessThanOrEqual(3.5);
    expect(
      await firstRow.evaluate((element) => getComputedStyle(element).backgroundColor),
      'hover must not add a background'
    ).toBe('rgba(0, 0, 0, 0)');

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

  test('pins the header and composer while only the message list scrolls', async ({
    page
  }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 900, height: 520 });
    await runPrompt(page, 'Show me my loans');

    const chips = page.locator('.follow-up');
    await expect(chips.first()).toBeVisible({ timeout: 20_000 });

    // A second turn makes the message list overflow the short viewport.
    const secondResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/chat') && response.request().method() === 'POST',
      { timeout: 55_000 }
    );
    await page.getByRole('button', { name: 'Show me my bills', exact: true }).click();

    const response = await secondResponse;
    expect(response.status(), 'second chat request should succeed').toBeLessThan(400);
    await response.finished().catch(() => undefined);
    await waitForChatSettled(page);

    await expect(page.locator('.assistant-turn')).toHaveCount(3);
    await expect(chips.first()).toBeVisible({ timeout: 20_000 });

    const log = page.locator('.chat-log');
    const logMetrics = await log.evaluate((element) => ({
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight
    }));
    expect(logMetrics.overflowY, 'the log is the scroller').toBe('auto');
    expect(
      logMetrics.scrollHeight,
      'messages should overflow the log viewport'
    ).toBeGreaterThan(logMetrics.clientHeight);

    const doc = await page.evaluate(() => ({
      overflowY: getComputedStyle(document.documentElement).overflowY,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollY: window.scrollY
    }));
    expect(doc.overflowY, 'the document should not scroll').toBe('hidden');
    expect(doc.scrollHeight, 'document fits the viewport').toBeLessThanOrEqual(
      doc.innerHeight + 1
    );
    expect(doc.scrollY).toBe(0);

    const heading = page.locator('.brand');
    const composer = page.locator('.composer');
    await expect(page.locator('.chat-header')).toHaveCount(0);
    await expect(heading).toBeVisible();
    await expect(composer).toBeVisible();

    await log.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.waitForTimeout(50);
    const headerAtTop = await heading.boundingBox();
    const composerAtTop = await composer.boundingBox();

    await log.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.waitForTimeout(50);
    const headerAtBottom = await heading.boundingBox();
    const composerAtBottom = await composer.boundingBox();

    expect(headerAtTop, 'header should be laid out').not.toBeNull();
    expect(headerAtBottom, 'header should stay laid out').not.toBeNull();
    expect(composerAtTop, 'composer should be laid out').not.toBeNull();
    expect(composerAtBottom, 'composer should stay laid out').not.toBeNull();

    expect(
      Math.abs(headerAtTop!.y - headerAtBottom!.y),
      'header stays pinned while messages scroll'
    ).toBeLessThanOrEqual(1);
    expect(headerAtBottom!.y).toBeGreaterThanOrEqual(0);
    expect(headerAtBottom!.y).toBeLessThan(200);

    expect(
      Math.abs(composerAtTop!.y - composerAtBottom!.y),
      'composer stays pinned while messages scroll'
    ).toBeLessThanOrEqual(1);
    expect(composerAtBottom!.y + composerAtBottom!.height).toBeLessThanOrEqual(
      doc.innerHeight + 1
    );

    const placement = await page.locator('.chat-followups').evaluate((element) => {
      const turns = Array.from(document.querySelectorAll('.assistant-turn'));
      const lastTurn = turns[turns.length - 1];
      return {
        inLog: element.closest('.chat-log') !== null,
        afterLastTurn:
          Boolean(lastTurn) &&
          Boolean(
            lastTurn!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
          )
      };
    });
    expect(placement, 'follow-ups belong inside the log after the last turn').toEqual({
      inLog: true,
      afterLastTurn: true
    });

    const rows = await chips.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { y: Math.round(rect.y), width: rect.width, height: rect.height };
      })
    );
    const innerWidth = await page.locator('.chat-followups').evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        element.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight)
      );
    });

    expect(rows, 'follow-ups are capped at three').toHaveLength(3);
    expect(new Set(rows.map((row) => row.y)).size, 'one suggestion per row').toBe(rows.length);
    for (const row of rows) {
      expect(row.width, 'each suggestion spans most of the log').toBeGreaterThan(
        innerWidth * 0.6
      );
      expect(row.height, 'follow-up rows stay compact').toBeLessThanOrEqual(40);
    }

    // After scrolling to the bottom the first follow-up is visible above the input.
    const firstFollowup = await chips.first().boundingBox();
    expect(firstFollowup, 'first follow-up should be laid out').not.toBeNull();
    expect(firstFollowup!.y).toBeGreaterThanOrEqual(0);
    expect(firstFollowup!.y + firstFollowup!.height).toBeLessThanOrEqual(
      composerAtBottom!.y + 1
    );

    expectNoErrors(errors);
  });

  test('cards render inline between assistant prose blocks', async ({ page }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    const events = [
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: "Here is what's coming up:"
      })}`,
      `event: insight\ndata: ${JSON.stringify({
        type: 'insight',
        kind: 'insight_upcoming_bills',
        payload: {
          count: 1,
          items: [
            {
              _id: 'bill-test-1',
              status: 'unpaid',
              payment_amount: 65.59,
              payee: 'Test Utility',
              payment_date: '2026-11-20'
            }
          ]
        }
      })}`,
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'That is the only item due.'
      })}`,
      `event: done\ndata: ${JSON.stringify({ type: 'done', sessionId: 'test-session' })}`
    ].join('\n\n');

    await page.route('**/api/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `${events}\n\n`
      });
    });

    await askChat(page, 'Show me my bills');

    await expectCardCount(page, 1);
    expect(await cardTitles(page)).toEqual(['Bills']);

    const lastTurn = page.locator('.assistant-turn').last();
    await expect(lastTurn.locator('.bubble.assistant .richtext')).toHaveCount(2);

    const order = await lastTurn.evaluate((turn) => {
      const rich = Array.from(turn.querySelectorAll('.bubble.assistant .richtext'));
      const cards = turn.querySelector('.chat-cards');
      const intro = rich[0];
      const takeaway = rich[1];
      const follows = (first: Element | undefined, second: Element | undefined): boolean =>
        Boolean(
          first &&
            second &&
            first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING
        );
      return {
        texts: rich.map((element) => element.textContent?.trim() ?? ''),
        introBeforeCards: follows(intro, cards ?? undefined),
        cardsBeforeTakeaway: follows(cards ?? undefined, takeaway)
      };
    });
    expect(order.texts).toHaveLength(2);
    expect(order.texts[0]).toContain('coming up');
    expect(order.texts[1]).toContain('only item due');
    expect(order.introBeforeCards).toBe(true);
    expect(order.cardsBeforeTakeaway).toBe(true);

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
    await expect(page.locator('.chat-card .badge')).toHaveCount(1);
    await expect(page.locator('.chat-card .badge')).toContainText('$');
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
    await expect(page.locator('.chat-card .badge')).toHaveCount(0);

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

    await expect(page.locator('.chat-card .badge')).toHaveCount(0);

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

    await expect(page.locator('.chat-card .badge')).toHaveCount(0);
    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('"Where did my money go last month?" renders one Spending card', async ({ page }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Where did my money go last month?');

    await expectCardCount(page, { min: 1, max: 1 });
    const titles = await cardTitles(page);
    expect(titles).toEqual(['Spending']);

    await expect(page.locator('.chat-card .badge')).toHaveCount(1);
    await expect(page.locator('.chat-card .badge')).toContainText('$');
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
    expect(titles).toEqual([]);
    await expect(page.locator('.chat-card .card-head')).toHaveCount(0);
    await expect(page.locator('.chat-card .badge')).toHaveCount(0);

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

    const emptyMascot = page.locator('.assistant-turn.intro .eno-thinking');
    await expect(emptyMascot).toBeVisible();
    const emptyFrame = emptyMascot.locator('img');
    await expect(emptyFrame).toHaveAttribute('src', /\/eno\/eno-navy-wave\.png$/);
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

    // Record the thinking image's pose every time it is inserted or retargeted.
    await page.evaluate(() => {
      const target = window as unknown as { __enoFrames?: string[] };
      target.__enoFrames = [];
      const log = document.querySelector('.chat-log');
      if (!log) return;
      const record = (): void => {
        const img = document.querySelector('.assistant-turn .eno-thinking[data-active="true"] img');
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
        attributeFilter: ['data-pose']
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
    const thinkingAvatar = page.locator('.assistant-turn .eno-thinking[data-active="true"]');
    await expect(thinkingAvatar).toHaveCount(1);
    await expect(thinkingAvatar).toBeVisible();

    // Flicker-free: exactly one image layer with no opacity transition.
    const thinkingImg = thinkingAvatar.locator('img');
    await expect(thinkingImg).toHaveCount(1);
    await expect
      .poll(() => thinkingImg.evaluate((img) => getComputedStyle(img).transitionDuration))
      .toBe('0s');

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

  test('shows high-level thinking steps then clears them when a card appears', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    // Slow the chat request so the initial (pre-tool) step is observable.
    await page.route('**/api/chat', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await page.evaluate(() => {
      const target = window as unknown as { __thinkingSteps?: string[] };
      target.__thinkingSteps = [];
      const log = document.querySelector('.chat-log');
      if (!log) return;
      const record = (): void => {
        const current = document.querySelector('.thinking-steps li.current');
        const text = current?.textContent?.trim();
        if (!text) return;
        const steps = target.__thinkingSteps!;
        if (!steps.includes(text)) steps.push(text);
      };
      const observer = new MutationObserver(record);
      observer.observe(log, { subtree: true, childList: true, characterData: true });
      record();
    });

    const composer = page.locator('textarea[aria-label="Ask Capital One"]');
    await composer.fill('Show me my bills');
    const send = page.locator('button.send[aria-label="Ask"]');
    await expect(send).toBeEnabled({ timeout: 30_000 });

    const chatResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/chat') && response.request().method() === 'POST',
      { timeout: 55_000 }
    );
    await composer.press('Enter');

    const steps = page.locator('.thinking-steps');
    await expect(steps).toBeVisible({ timeout: 20_000 });
    await expect(steps.locator('li.current')).toHaveText('Understanding your question');

    // The regression: once a card is visible the pending row must go away and
    // must not keep the prose hidden behind the old status line.
    await expect(page.locator('.chat-card').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.thinking-row')).toHaveCount(0);
    await expect(page.locator('.chat-log .status-line')).toHaveCount(0);

    const response = await chatResponse;
    expect(response.status(), 'chat request should succeed').toBeLessThan(400);
    await response.finished().catch(() => undefined);
    await waitForChatSettled(page);

    const observed = await page.evaluate(
      () => (window as unknown as { __thinkingSteps?: string[] }).__thinkingSteps ?? []
    );
    expect(observed.length, `observed steps: ${JSON.stringify(observed)}`).toBeGreaterThanOrEqual(2);
    expect(observed[0]).toBe('Understanding your question');
    for (const label of observed) {
      const lower = label.toLowerCase();
      expect(lower).not.toContain('nessie');
      expect(lower).not.toContain('insight');
      expect(lower).not.toContain('tool');
      expect(label).not.toContain('_');
    }

    await expect(page.locator('.thinking-row')).toHaveCount(0);
    expectNoErrors(errors);
  });

  test('cards keep their contrast treatment in dark mode', async ({ page }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    await page.locator('button[aria-label="Switch to dark mode"]').click();
    await expect(page.locator('.dashboard')).toHaveAttribute('data-theme', 'dark');

    await askChat(page, 'Show me my loans');
    await expectCardCount(page, 1);
    expect(await cardTitles(page)).toEqual(['Loans']);

    const surface = await page.locator('.chat-card').first().evaluate((card) => {
      const style = getComputedStyle(card);
      const accent = getComputedStyle(card, '::before');
      return {
        shadow: style.boxShadow,
        borderTopWidth: Number.parseFloat(style.borderTopWidth),
        accentHeight: Number.parseFloat(accent.height)
      };
    });
    expect(surface.shadow, 'dark cards should still lift').not.toBe('none');
    expect(surface.borderTopWidth).toBeGreaterThanOrEqual(1);
    expect(surface.accentHeight).toBeGreaterThan(2);
    expect(surface.accentHeight).toBeLessThan(4);

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('Eno mascot follows the active theme', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/chat');

    await expect(page.locator('.chat-header')).toHaveCount(0);
    await expect(page.locator('.chat-heading')).toHaveCount(0);
    await expect(page.locator('.profile-name')).toHaveText('Maya', { timeout: 30_000 });

    const emptyImg = page.locator('.assistant-turn.intro .eno-thinking img');
    await expect(emptyImg).toHaveAttribute('src', /\/eno\/eno-navy-wave\.png$/);

    await page.locator('button[aria-label="Switch to dark mode"]').click();
    await expect(page.locator('.dashboard')).toHaveAttribute('data-theme', 'dark');

    await expect(emptyImg).toHaveAttribute('src', /\/eno\/eno-light-wave\.png$/);

    expectNoErrors(errors);
  });
});

