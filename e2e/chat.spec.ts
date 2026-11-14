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

const STARTER_PROMPTS = [
  'Give me a snapshot of my finances',
  'Where did my money go last month?',
  "What's due in the next 30 days?",
  'Anything weird in my transactions?',
  'Find an ATM near Arlington'
];

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

interface StreamChunk {
  delay: number;
  event: string;
  data: unknown;
}

/**
 * Replace `/api/chat` in the page with a chunked SSE stream so tests can hold a
 * turn pending long enough to observe its loading state.
 */
async function mockChatStream(page: Page, chunks: StreamChunk[]): Promise<void> {
  await page.addInitScript((streamChunks: StreamChunk[]) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      if (!url.includes('/api/chat')) return originalFetch(input, init);

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          for (const chunk of streamChunks) {
            await new Promise((resolve) => setTimeout(resolve, chunk.delay));
            controller.enqueue(
              encoder.encode(`event: ${chunk.event}\ndata: ${JSON.stringify(chunk.data)}\n\n`)
            );
          }
          controller.close();
        }
      });
      return Promise.resolve(
        new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' }
        })
      );
    }) as typeof window.fetch;
  }, chunks);
}

/** Every title must be one of the supplied product labels. */
function expectTitlesWithin(titles: string[], allowed: string[]): void {
  for (const title of titles) {
    expect(allowed, `unexpected card title "${title}"`).toContain(title);
  }
}

/** Follow-ups start at the assistant content edge and span the bubble max width. */
async function expectFollowupsMatchBubble(page: Page): Promise<void> {
  const followups = page.locator('.chat-followups');
  const content = page.locator('.assistant-turn .assistant-content').last();
  await expect(followups).toBeVisible();
  await expect(content).toBeVisible();
  const [followBox, contentBox] = await Promise.all([
    followups.boundingBox(),
    content.boundingBox()
  ]);
  expect(followBox, 'follow-up block should be laid out').not.toBeNull();
  expect(contentBox, 'assistant content should be laid out').not.toBeNull();
  expect(
    Math.abs(followBox!.x - contentBox!.x),
    'follow-ups align with the assistant content left edge'
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(followBox!.width - contentBox!.width * 0.88),
    'follow-ups span the bubble max width'
  ).toBeLessThanOrEqual(2);

  const chips = followups.locator('.follow-up');
  expect(
    await followups.locator('.follow-up-arrow').count(),
    'every follow-up has a trailing arrow'
  ).toBe(await chips.count());
}

/** Follow-up rows use straight hairline dividers, with none above the first. */
async function expectFollowupBorders(page: Page): Promise<void> {
  const rows = await page.locator('.follow-up').evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        top: style.borderTopWidth,
        radius: style.borderRadius,
        width: rect.width
      };
    })
  );
  expect(rows.length, 'follow-up rows are present').toBeGreaterThan(0);
  rows.forEach((row, index) => {
    expect(row.radius, 'follow-up corners are square').toBe('0px');
    if (index === 0) {
      expect(row.top, 'the first row has no top divider').toBe('0px');
    } else {
      expect(row.top, 'subsequent rows have a hairline divider').toBe('1px');
      expect(row.width, 'the divider spans the row').toBeGreaterThan(0);
    }
  });
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

    // Starters live in the log as follow-ups, not above the composer.
    await expect(page.locator('.shortcuts')).toHaveCount(0);
    const introFollowups = page.locator('.chat-followups');
    await expect(introFollowups).toHaveCount(1);
    const starterChips = introFollowups.locator('.follow-up');
    await expect(starterChips).toHaveCount(STARTER_PROMPTS.length);
    const starterLabels = (await starterChips.allInnerTexts()).map((label) => label.trim());
    for (const prompt of STARTER_PROMPTS) {
      expect(starterLabels).toContain(prompt);
    }

    const introFollowupPlacement = await introFollowups.evaluate((element) => {
      const introTurn = document.querySelector('.assistant-turn.intro');
      return {
        inLog: element.closest('.chat-log') !== null,
        afterIntro: Boolean(
          introTurn &&
            introTurn.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
        )
      };
    });
    expect(introFollowupPlacement, 'starters follow the intro inside the log').toEqual({
      inLog: true,
      afterIntro: true
    });

    const starterRows = await starterChips.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { y: Math.round(rect.y), width: rect.width, height: rect.height };
      })
    );
    const introFollowupWidth = await introFollowups.evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        element.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight)
      );
    });
    expect(new Set(starterRows.map((row) => row.y)).size, 'one starter per row').toBe(
      starterRows.length
    );
    for (const row of starterRows) {
      expect(row.width, 'each starter spans most of the log').toBeGreaterThan(
        introFollowupWidth * 0.6
      );
      expect(row.height, 'starter rows stay compact').toBeLessThanOrEqual(40);
    }
    await expectFollowupsMatchBubble(page);
    await expectFollowupBorders(page);

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

    // The intro starters are replaced by the post-turn follow-ups (max three).
    const postTurnChips = page.locator('.chat-followups .follow-up');
    await expect(postTurnChips.first()).toBeVisible({ timeout: 20_000 });
    const postTurnCount = await postTurnChips.count();
    expect(postTurnCount, 'post-turn follow-ups appear').toBeGreaterThanOrEqual(1);
    expect(postTurnCount, 'post-turn follow-ups are capped at three').toBeLessThanOrEqual(3);
    const postTurnLabels = (await postTurnChips.allInnerTexts()).map((label) => label.trim());
    expect(postTurnLabels, 'starter rows are gone after sending').not.toEqual([
      ...STARTER_PROMPTS
    ]);
    await expectFollowupsMatchBubble(page);
    await expectFollowupBorders(page);

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
    await expect(page.locator('.shortcuts')).toHaveCount(0);
    const resetChips = page.locator('.chat-followups .follow-up');
    await expect(resetChips).toHaveCount(STARTER_PROMPTS.length, { timeout: 20_000 });
    const resetLabels = (await resetChips.allInnerTexts()).map((label) => label.trim());
    for (const prompt of STARTER_PROMPTS) {
      expect(resetLabels).toContain(prompt);
    }
    await expectFollowupsMatchBubble(page);
    await expectFollowupBorders(page);

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
    await expectFollowupsMatchBubble(page);
    await expectFollowupBorders(page);

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
    await expectFollowupsMatchBubble(page);
    await expectFollowupBorders(page);

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

  test('"Show me my recent transactions" renders one inline transaction list', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    const deposits = {
      type: 'insight',
      kind: 'nessie_list_account_deposits',
      accountId: 'acct-checking',
      payload: {
        count: 3,
        items: [
          {
            _id: 'dep-1',
            description: 'Payroll',
            amount: 1250,
            transactionDate: '2026-11-01',
            status: 'posted'
          },
          {
            _id: 'dep-2',
            description: 'Refund',
            amount: 20,
            transactionDate: '2026-11-02',
            status: 'posted'
          },
          {
            _id: 'dep-3',
            description: 'Interest',
            amount: 2.5,
            transactionDate: '2026-11-03',
            status: 'posted'
          }
        ]
      }
    };
    const withdrawals = {
      type: 'insight',
      kind: 'nessie_list_account_withdrawals',
      accountId: 'acct-checking',
      payload: {
        count: 3,
        items: [
          {
            _id: 'wd-1',
            description: 'Coffee',
            amount: 4.5,
            transactionDate: '2026-11-04',
            status: 'posted'
          },
          {
            _id: 'wd-2',
            description: 'Groceries',
            amount: 62.3,
            transactionDate: '2026-11-05',
            status: 'posted'
          },
          {
            _id: 'wd-3',
            description: 'Rent',
            amount: 1800,
            transactionDate: '2026-11-06',
            status: 'posted'
          }
        ]
      }
    };
    const events = [
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'Here are your recent transactions: '
      })}`,
      `event: insight\ndata: ${JSON.stringify(deposits)}`,
      `event: insight\ndata: ${JSON.stringify(withdrawals)}`,
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'Most recent first.'
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

    await askChat(page, 'Show me my recent transactions');

    const lists = page.locator('.transaction-list-card');
    await expect(lists).toHaveCount(1, { timeout: 20_000 });
    await expect(lists.first()).toBeVisible();

    const rows = lists.locator('.transaction-row');
    const rowCount = await rows.count();
    expect(rowCount, 'show multiple rows').toBeGreaterThanOrEqual(2);
    expect(rowCount, 'visible rows are capped at 8').toBeLessThanOrEqual(8);

    const listText = await lists.first().innerText();
    expect(listText, 'rows show descriptions').toContain('Payroll');
    expect(listText, 'rows show dates').toMatch(/Nov \d/);
    expect(listText, 'rows show amounts').toContain('1,250');

    // No legacy chrome, title, badge, or reason chip.
    await expect(page.locator('.chat-card')).toHaveCount(0);
    await expect(page.locator('.transaction-list-card .card-head')).toHaveCount(0);
    await expect(page.locator('.transaction-list-card .badge')).toHaveCount(0);
    await expect(page.locator('.transaction-list-card .flag, .flag')).toHaveCount(0);

    // Every row links to the owning account, opened in a new tab.
    const links = lists.locator('.transaction-row a.transaction-link');
    await expect(links).toHaveCount(rowCount);
    const hrefs = await links.evaluateAll((elements) =>
      elements.map((element) => ({
        href: element.getAttribute('href') ?? '',
        target: element.getAttribute('target'),
        rel: element.getAttribute('rel') ?? ''
      }))
    );
    for (const link of hrefs) {
      expect(link.target).toBe('_blank');
      expect(link.rel).toContain('noopener');
      expect(link.href).toMatch(/^\/dashboard\?customer=[^&]+&account=acct-checking&txn=.+/);
    }
    await expect(page.locator('.transaction-row .open-icon').first()).toBeVisible();

    // The prose introduces the list; the card follows that intro inside the turn.
    const prose = (
      await page
        .locator('.assistant-turn')
        .last()
        .locator('.bubble.assistant .richtext')
        .allInnerTexts()
    )
      .join('\n')
      .trim();
    expect(prose.length, 'assistant prose introduces the list').toBeGreaterThan(0);

    const placement = await page.locator('.assistant-turn').last().evaluate((turn) => {
      const content = turn.querySelector('.assistant-content');
      const list = turn.querySelector('.transaction-list-card');
      const intro = turn.querySelector('.bubble.assistant .richtext');
      const follows = (first: Element | null, second: Element | null): boolean =>
        Boolean(
          first &&
            second &&
            first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING
        );
      return {
        inContent: Boolean(content && list && content.contains(list)),
        afterIntro: follows(intro, list)
      };
    });
    expect(placement).toEqual({ inContent: true, afterIntro: true });

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

  test('"Any suspicious transactions?" cites flagged charges with inline transaction cards', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    const insight = {
      type: 'insight',
      kind: 'insight_anomalies',
      accountId: 'acct-checking',
      payload: {
        count: 2,
        findings: [
          {
            _id: 'txn-apple',
            type: 'outlier',
            description: 'APPLE STORE',
            amount: 1299,
            date: '2026-11-03'
          },
          {
            _id: 'txn-netflix',
            type: 'duplicate',
            description: 'NETFLIX.COM',
            amount: 15.49,
            date: '2026-11-02',
            duplicateOf: '2026-11-01'
          }
        ]
      }
    };
    const events = [
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'You have a suspiciously large transaction at APPLE: '
      })}`,
      `event: insight\ndata: ${JSON.stringify(insight)}`,
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: ' and a duplicate transaction at NETFLIX: '
      })}`,
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'both posted this week.'
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

    await askChat(page, 'Any suspicious transactions?');

    const cards = page.locator('.transaction-card');
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });

    const count = await cards.count();
    expect(count, 'render 1–2 single-transaction cards').toBeGreaterThanOrEqual(1);
    expect(count, 'render 1–2 single-transaction cards').toBeLessThanOrEqual(2);

    for (let index = 0; index < count; index += 1) {
      await expect(cards.nth(index)).toHaveAttribute('data-kind', 'transaction');
    }

    // Cards show only the transaction: merchant and amount, never a reason chip.
    const cardsText = (await cards.allInnerTexts()).join('\n');
    expect(cardsText, 'cards name the merchant').toContain('APPLE STORE');
    expect(cardsText, 'cards name the merchant').toContain('NETFLIX.COM');
    expect(cardsText, 'cards show the amount').toContain('1,299');
    expect(cardsText).not.toContain('Possible duplicate');
    expect(cardsText).not.toContain('Unusual amount');
    await expect(page.locator('.transaction-card .flag, .flag')).toHaveCount(0);
    await expect(page.locator('.transaction-card[data-flag]')).toHaveCount(0);

    // Each anomaly card links to its transaction with the finding _id.
    const cardLinks = cards.locator('a.transaction-link');
    await expect(cardLinks).toHaveCount(count);
    const cardHrefs = await cardLinks.evaluateAll((elements) =>
      elements.map((element) => ({
        href: element.getAttribute('href') ?? '',
        target: element.getAttribute('target'),
        rel: element.getAttribute('rel') ?? ''
      }))
    );
    for (const link of cardHrefs) {
      expect(link.target).toBe('_blank');
      expect(link.rel).toContain('noopener');
      expect(link.href).toMatch(/^\/dashboard\?customer=[^&]+&account=acct-checking&txn=.+/);
    }
    expect(cardHrefs.map((link) => link.href)).toEqual([
      expect.stringMatching(/txn=txn-apple$/),
      expect.stringMatching(/txn=txn-netflix$/)
    ]);

    // Exactly one assistant turn owns the cards; no archived card chrome.
    await expect(
      page.locator('.assistant-turn').filter({ has: page.locator('.transaction-card') })
    ).toHaveCount(1);
    await expect(page.locator('.chat-card')).toHaveCount(0);
    await expect(page.locator('.card-head, .badge, .eyebrow')).toHaveCount(0);

    // Prose carries the explanation; cards sit after their merchant mention.
    const prose = (await assistantText(page)).trim();
    expect(prose.length, 'assistant prose explains the finding').toBeGreaterThan(0);
    expect(prose).toMatch(/duplicate|large|suspicious/i);

    const order = await page.locator('.assistant-turn').last().evaluate((turn) => {
      const content = turn.querySelector('.assistant-content');
      if (!content) return [];
      return Array.from(content.children).flatMap((child) => {
        if (child.querySelector('.transaction-card')) return ['card'];
        if (child.querySelector('.bubble.assistant .richtext')) return ['text'];
        return [];
      });
    });
    expect(order, 'text → card → text → card → text ordering').toEqual([
      'text',
      'card',
      'text',
      'card',
      'text'
    ]);

    const combined = `${cardsText}\n${await assistantText(page)}`;
    expect(combined).not.toMatch(/outlier|median|\bmad\b|threshold|findings/i);

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
  test('deep link opens the account activity and highlights the transaction', async ({
    page
  }) => {
    const errors = collectErrors(page);

    const customersResponse = await page.request.get('/api/customers');
    const { customers } = (await customersResponse.json()) as {
      customers: Array<{ id: string; lastName: string }>;
    };
    const maya = customers.find((customer) => customer.lastName === 'Chen') ?? customers[0];
    expect(maya, 'Maya should exist in the fixture customers').toBeTruthy();

    const sessionResponse = await page.request.post('/api/session', {
      data: { customerId: maya.id }
    });
    expect(sessionResponse.ok()).toBe(true);

    const accountsResponse = await page.request.get('/api/accounts');
    const accountsPayload = (await accountsResponse.json()) as {
      accounts: Array<{ id: string; type: string }>;
    };
    const checking =
      accountsPayload.accounts.find((account) =>
        account.type.toLowerCase().includes('checking')
      ) ?? accountsPayload.accounts[0];
    expect(checking, 'a checking account should exist').toBeTruthy();

    const detailResponse = await page.request.get(
      `/api/accounts/${encodeURIComponent(checking.id)}`
    );
    const detail = (await detailResponse.json()) as {
      transactions: Array<{ id: string; description: string }>;
    };
    const transaction = detail.transactions[0];
    expect(transaction?.id, 'the account should have a transaction').toBeTruthy();

    await page.goto(
      `/dashboard?customer=${encodeURIComponent(maya.id)}&account=${encodeURIComponent(
        checking.id
      )}&txn=${encodeURIComponent(transaction.id)}`
    );

    await expect(page.locator('.view-shell')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.profile-name')).toHaveText('Maya', { timeout: 30_000 });
    await expect(page.locator('.tab[aria-pressed="true"]')).toContainText('Activity');

    const selectorId = transaction.id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const row = page.locator(`[data-transaction-id="${selectorId}"]`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toHaveClass(/highlight/);

    await page.waitForTimeout(4000);
    await expect(row, 'the highlight persists past the old timeout').toHaveClass(/highlight/);
    const highlightStyle = await row.evaluate((element) => {
      const style = getComputedStyle(element);
      return { boxShadow: style.boxShadow, background: style.backgroundColor };
    });
    expect(highlightStyle.boxShadow, 'no inset accent bar').not.toContain('inset');
    expect(highlightStyle.background, 'a tinted background marks the row').not.toBe(
      'rgba(0, 0, 0, 0)'
    );

    await expect
      .poll(
        async () => {
          const box = await row.boundingBox();
          const viewport = page.viewportSize();
          if (!box || !viewport) return false;
          return box.y >= -1 && box.y + box.height <= viewport.height + 1;
        },
        { message: 'the highlighted row is scrolled into the viewport' }
      )
      .toBe(true);

    expectNoErrors(errors);
  });
});

test.describe('Eno mascot', () => {
  test('Eno logo renders and pulses while thinking', async ({ page }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    const emptyMascot = page.locator('.assistant-turn.intro .eno-thinking');
    await expect(emptyMascot).toBeVisible();
    const emptyLogo = emptyMascot.locator('img');
    await expect(emptyLogo).toHaveAttribute('src', /\/eno\/eno_logo_light\.png$/);
    await expect
      .poll(
        async () =>
          emptyLogo.evaluate((img) => (img as HTMLImageElement).naturalWidth),
        { timeout: 10_000 }
      )
      .toBe(1000);

    // Slow the chat request enough for the pending mascot pulse to run.
    await page.route('**/api/chat', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
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

    // One logo layer, pulsing while thinking (no frame swapping).
    const thinkingImg = thinkingAvatar.locator('img');
    await expect(thinkingImg).toHaveCount(1);
    await expect
      .poll(() => thinkingImg.evaluate((img) => getComputedStyle(img).animationName))
      .not.toBe('none');

    const response = await chatResponse;
    expect(response.status(), 'chat request should succeed').toBeLessThan(400);
    await response.finished().catch(() => undefined);
    await waitForChatSettled(page);

    await expect(thinkingRow).toHaveCount(0);

    const lastAvatar = page.locator('.assistant-turn .eno-thinking').last();
    await expect(lastAvatar).toHaveAttribute('data-active', 'false');
    await expect
      .poll(() => lastAvatar.locator('img').evaluate((img) => getComputedStyle(img).animationName))
      .toBe('none');
    expectNoErrors(errors);
  });

  test('shows high-level thinking steps then clears them when a card appears', async ({
    page
  }) => {
    const errors = collectErrors(page);

    // Chunked SSE keeps the turn pending after the card and prose arrive so
    // the compact loading line is observable for the whole turn.
    await mockChatStream(page, [
      {
        delay: 250,
        event: 'tool_start',
        data: { type: 'tool_start', name: 'insight_anomalies', label: '' }
      },
      {
        delay: 250,
        event: 'text',
        data: { type: 'text', delta: 'You have a suspiciously large transaction at APPLE: ' }
      },
      {
        delay: 250,
        event: 'insight',
        data: {
          type: 'insight',
          kind: 'insight_anomalies',
          payload: {
            count: 1,
            findings: [
              {
                type: 'outlier',
                description: 'APPLE STORE',
                amount: 1299,
                date: '2026-11-03'
              }
            ]
          }
        }
      },
      {
        delay: 250,
        event: 'text',
        data: { type: 'text', delta: 'That charge stands out.' }
      },
      {
        delay: 1500,
        event: 'done',
        data: { type: 'done', sessionId: 'test-session' }
      }
    ]);

    await loadChat(page);

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

    // The regression: once a card is visible the checklist may clear, but the
    // compact loading line must stay until the turn finishes and the streamed
    // prose must not be held back behind it.
    await expect(page.locator('.transaction-card').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.thinking-row')).toHaveCount(0);
    await expect(page.locator('.loading-line')).toBeVisible();
    await expect(page.locator('.chat-log .status-line')).not.toHaveCount(0);
    await expect(page.locator('.bubble.assistant .richtext').last()).toContainText(
      'suspiciously large'
    );

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
    await expect(page.locator('.loading-line')).toHaveCount(0);
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
    await expect(emptyImg).toHaveAttribute('src', /\/eno\/eno_logo_light\.png$/);

    await page.locator('button[aria-label="Switch to dark mode"]').click();
    await expect(page.locator('.dashboard')).toHaveAttribute('data-theme', 'dark');

    await expect(emptyImg).toHaveAttribute('src', /\/eno\/eno_logo_dark\.png$/);

    expectNoErrors(errors);
  });
});

