import { expect, test, type Page } from '@playwright/test';
import {
  askChat,
  assistantText,
  cardKinds,
  cardShells,
  cardText,
  collectErrors,
  expectCardCount,
  expectCardStyle,
  expectNoCardValueDuplicate,
  expectNoErrors,
  waitForChatSettled
} from './helpers';

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
  test('"Show me my loans" renders exactly one primitive loan card', async ({ page }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Show me my loans');

    const loan = page.locator('.loan-card');
    await expect(loan).toHaveCount(1);
    await expect(loan).toBeVisible();
    await expect(loan).toHaveAttribute('data-kind', 'loan');

    const text = await loan.innerText();
    expect(text.length, 'the loan card shows its type').toBeGreaterThan(0);
    // Primitive: no credit score, recommendation, or coverage copy.
    expect(text.toLowerCase()).not.toMatch(/credit score|recommend|insight|coverage|tip:/);

    await expect(page.locator('.chat-card')).toHaveCount(0);
    await expect(page.locator('.entity-card .loan-card')).toHaveCount(1);
    expect(
      await loan.evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'the loan card renders inline inside the prose bubble'
    ).toBe(true);

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('a rewards payload renders one primitive reward card', async ({ page }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    const events = [
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'Your Venture Rewards balance is '
      })}`,
      `event: insight\ndata: ${JSON.stringify({
        type: 'insight',
        kind: 'nessie_list_customer_accounts',
        payload: {
          accounts: [
            { _id: 'acct-checking', type: 'Checking', nickname: 'Everyday Checking', rewards: 0 },
            { _id: 'acct-venture', type: 'Credit Card', nickname: 'Venture Rewards', rewards: 24850 },
            { _id: 'acct-quick', type: 'Credit Card', nickname: 'Quicksilver', rewards: 5000 }
          ],
          extra: 'do not leak'
        }
      })}`,
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'the highest across your cards.'
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

    await askChat(page, 'Show me my credit card rewards');

    const card = page.locator('.reward-card');
    await expect(card).toHaveCount(1, { timeout: 20_000 });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-kind', 'reward');

    const text = await card.innerText();
    expect(text).toContain('Venture Rewards');
    expect(text).toContain('24,850 pts');
    // Primitive: points are never converted into an invented dollar value.
    expect(text, 'no invented dollar value for points').not.toContain('$');

    await expect(page.locator('.chat-card')).toHaveCount(0);
    await expect(page.locator('.entity-card .reward-card')).toHaveCount(1);
    expect(
      await card.evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'the reward card renders inline inside the prose bubble'
    ).toBe(true);

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('a merchant payload renders one primitive merchant card', async ({ page }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    const events = [
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'You shop at Whole Foods Market often. '
      })}`,
      `event: insight\ndata: ${JSON.stringify({
        type: 'insight',
        kind: 'nessie_list_merchants',
        payload: {
          count: 2,
          truncated: false,
          items: [
            {
              _id: 'merchant-whole-foods',
              name: 'Whole Foods Market',
              category: 'groceries',
              address: {
                street: '123 Main St',
                city: 'Arlington',
                state: 'VA',
                zip: '22201'
              }
            },
            {
              _id: 'merchant-other',
              name: 'Other Merchant',
              category: 'retail'
            }
          ]
        }
      })}`,
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'It is your usual grocery stop.'
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

    await askChat(page, 'Where do I shop?');

    const card = page.locator('.merchant-card');
    await expect(card).toHaveCount(1, { timeout: 20_000 });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-kind', 'merchant');

    const text = await card.innerText();
    expect(text).toContain('Whole Foods Market');
    expect(text).toContain('Groceries');
    expect(text).toContain('123 Main St, Arlington, VA');
    // Primitive: one merchant only, no amount/count, recommendation, or list.
    expect(text).not.toContain('Other Merchant');
    expect(text).not.toMatch(/\$|\bcount\b|spend here|recommend|tip:/i);

    await expect(page.locator('.chat-card')).toHaveCount(0);
    await expect(page.locator('.entity-card .merchant-card')).toHaveCount(1);
    expect(
      await card.evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'the merchant card renders inline inside the prose bubble'
    ).toBe(true);

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('a single customer payload renders one primitive profile card', async ({ page }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    const events = [
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'This is the profile on file for Maya Chen. '
      })}`,
      `event: insight\ndata: ${JSON.stringify({
        type: 'insight',
        kind: 'nessie_get_customer',
        payload: {
          _id: 'cust-maya',
          firstName: 'Maya',
          lastName: 'Chen',
          email: 'maya@example.com',
          phone: '555-0100',
          address: {
            street: '123 Main St',
            city: 'Arlington',
            state: 'VA',
            zip: '22201'
          }
        }
      })}`,
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'You can update it from the app if anything changes.'
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

    await askChat(page, 'Show me my profile');

    const card = page.locator('.profile-card');
    await expect(card).toHaveCount(1, { timeout: 20_000 });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-kind', 'profile');

    const text = await card.innerText();
    expect(text).toContain('Maya Chen');
    expect(text).toContain('Arlington, VA');
    // Primitive and private: no street, zip, contact, or identifier fields.
    expect(text).not.toContain('123 Main St');
    expect(text).not.toContain('22201');
    expect(text).not.toContain('maya@example.com');
    expect(text).not.toContain('555-0100');
    expect(text).not.toContain('cust-maya');

    await expect(page.locator('.chat-card')).toHaveCount(0);
    await expect(page.locator('.entity-card .profile-card')).toHaveCount(1);
    expect(
      await card.evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'the profile card renders inline inside the prose bubble'
    ).toBe(true);

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('a goal projection renders one primitive goal card', async ({ page }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    const events = [
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'Here is the projection for your savings goal: '
      })}`,
      `event: insight\ndata: ${JSON.stringify({
        type: 'insight',
        kind: 'insight_goal_projection',
        payload: {
          asOf: '2026-11-14',
          accountId: 'acct-savings',
          currentBalance: 12640,
          targetAmount: 20000,
          monthlyNet: 1840,
          monthsToTarget: 4,
          projections: [{ months: 3, projectedBalance: 18160 }],
          onTrack: true,
          extra: 'do not leak'
        }
      })}`,
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'the prose carries the progress narrative.'
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

    await askChat(page, 'Help me plan a savings goal');

    const card = page.locator('.goal-card');
    await expect(card).toHaveCount(1, { timeout: 20_000 });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-kind', 'goal');

    const text = await card.innerText();
    expect(text).toContain('Target');
    expect(text).toContain('$20,000.00');
    expect(text).toContain('Current');
    expect(text).toContain('$12,640.00');
    expect(text).toContain('Months to target');
    expect(text).toContain('Projected date');
    expect(text.toLowerCase(), 'no advice or on-track copy').not.toMatch(
      /on track|recommend|you should|tip:/
    );

    await expect(page.locator('.chat-card')).toHaveCount(0);
    await expect(page.locator('.entity-card .goal-card')).toHaveCount(1);
    expect(
      await card.evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'the goal card renders inline inside the prose bubble'
    ).toBe(true);

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('an overview prompt renders one primitive cashflow month', async ({ page }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    const events = [
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'Your latest complete month: '
      })}`,
      `event: insight\ndata: ${JSON.stringify({
        type: 'insight',
        kind: 'insight_financial_overview',
        payload: {
          totalRewards: 0,
          accounts: [],
          monthlyCashflow: [
            { month: '2020-01', inflow: 5000, outflow: 4200, net: 800 },
            { month: '2020-02', inflow: 6100, outflow: 4800, net: 1300 },
            { month: '2020-03', inflow: 900, outflow: 300, net: 600 }
          ]
        }
      })}`,
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'the prose compares it with the other months.'
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

    await askChat(page, 'Give me a snapshot of my finances');

    const card = page.locator('.cashflow-card');
    await expect(card).toHaveCount(1, { timeout: 20_000 });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-kind', 'cashflow');

    const text = await card.innerText();
    expect(text).toContain('February 2020');
    expect(text).toContain('Inflow');
    expect(text).toContain('$6,100.00');
    expect(text).toContain('Outflow');
    expect(text).toContain('$4,800.00');
    expect(text).toContain('Net');
    expect(text).toContain('+$1,300.00');

    await expect(page.locator('.chat-card')).toHaveCount(0);
    await expect(page.locator('.entity-card .cashflow-card')).toHaveCount(1);
    expect(
      await card.evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'the cashflow card renders inline inside the prose bubble'
    ).toBe(true);

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

    // The mascot sits to the left of the intro bubble, aligned to its bottom.
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
      Math.abs(
        introAvatarBox!.y +
          introAvatarBox!.height -
          (introBubbleBox!.y + introBubbleBox!.height)
      ),
      'intro mascot should align with the bottom of the bubble'
    ).toBeLessThan(20);
    if (introBubbleBox!.height > introAvatarBox!.height + 20) {
      expect(
        introAvatarBox!.y,
        'intro mascot should sit below the top of the bubble'
      ).toBeGreaterThan(introBubbleBox!.y);
    }

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
      Math.abs(
        responderAvatarBox!.y +
          responderAvatarBox!.height -
          (responderContentBox!.y + responderContentBox!.height)
      ),
      'responder mascot should align with the bottom of its content'
    ).toBeLessThan(20);
    if (responderContentBox!.height > responderAvatarBox!.height + 20) {
      expect(
        responderAvatarBox!.y,
        'responder mascot should sit below the top of its content'
      ).toBeGreaterThan(responderContentBox!.y);
    }

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

    await expect(page.locator('.loan-card')).toHaveCount(1);

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
    await expect.poll(() => page.locator('.bill-card').count(), { timeout: 20_000 }).toBe(1);

    await expect(page.locator('.loan-card')).toHaveCount(1);
    await expect(page.locator('.bill-card')).toHaveCount(1);
    await expect(page.locator('.cashflow-card')).toHaveCount(0);

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
    await expect(page.locator('.bill-card')).toHaveCount(1);
    await expect(page.locator('.bill-card')).toHaveAttribute('data-kind', 'bill');

    const lastTurn = page.locator('.assistant-turn').last();
    await expect(lastTurn.locator('.bubble.assistant .richtext')).toHaveCount(2);

    const order = await lastTurn.evaluate((turn) => {
      const rich = Array.from(turn.querySelectorAll('.bubble.assistant .richtext'));
      const cards = turn.querySelector('.bill-card');
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

  test('buffers inline cards until the prose reaches their merchant', async ({ page }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    await mockChatStream(page, [
      {
        delay: 100,
        event: 'tool_start',
        data: { type: 'tool_start', name: 'insight_anomalies', label: '' }
      },
      {
        delay: 100,
        event: 'insight',
        data: {
          type: 'insight',
          kind: 'insight_anomalies',
          accountId: 'acct-checking',
          payload: {
            count: 1,
            findings: [
              {
                _id: 'txn-apple-buffered',
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
        delay: 150,
        event: 'text',
        data: { type: 'text', delta: 'I checked your recent activity.' }
      },
      {
        delay: 2500,
        event: 'text',
        data: { type: 'text', delta: ' There is a large charge at APPLE STORE.' }
      },
      {
        delay: 1200,
        event: 'done',
        data: { type: 'done', sessionId: 'test-session' }
      }
    ]);

    const composer = page.locator('textarea[aria-label="Ask Capital One"]');
    await composer.fill('Any suspicious transactions?');
    const send = page.locator('button.send[aria-label="Ask"]');
    await expect(send).toBeEnabled({ timeout: 30_000 });
    await composer.press('Enter');

    const turn = page.locator('.assistant-turn').last();
    const prose = turn.locator('.bubble.assistant .richtext');

    // The insight has arrived and text is streaming, but the card's merchant
    // mention has not been streamed yet, so nothing renders above the prose.
    await expect(prose).toContainText('checked your recent activity', { timeout: 10_000 });
    await expect(page.locator('.chat-panel')).toHaveAttribute('data-streaming', 'true');
    await expect(turn.locator('.transaction-card')).toHaveCount(0);
    await expect(page.locator('.loading-line')).toBeVisible();
    await expect(prose).toBeVisible();

    // Once the prose reaches the merchant, the buffered card appears inline
    // while the turn is still pending.
    await expect(turn.locator('.transaction-card')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('.chat-panel')).toHaveAttribute('data-streaming', 'true');
    await expect(turn.locator('.transaction-card')).toContainText('APPLE STORE');
    expect(
      await turn
        .locator('.transaction-card')
        .first()
        .evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'the buffered transaction renders inside the assistant bubble'
    ).toBe(true);
    expect(await prose.count(), 'prose is visible while the turn streams').toBeGreaterThan(0);

    await waitForChatSettled(page);
    await expect(turn.locator('.transaction-card')).toHaveCount(1);
    expectNoErrors(errors);
  });

  test('buffers a merchant card until the prose reaches its name', async ({ page }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    await mockChatStream(page, [
      {
        delay: 100,
        event: 'insight',
        data: {
          type: 'insight',
          kind: 'nessie_list_merchants',
          payload: {
            count: 1,
            truncated: false,
            items: [
              {
                _id: 'merchant-whole-foods',
                name: 'Whole Foods Market',
                category: 'groceries'
              }
            ]
          }
        }
      },
      {
        delay: 150,
        event: 'text',
        data: { type: 'text', delta: 'I checked where you shop.' }
      },
      {
        delay: 2500,
        event: 'text',
        data: { type: 'text', delta: ' Whole Foods Market comes up most often.' }
      },
      {
        delay: 1200,
        event: 'done',
        data: { type: 'done', sessionId: 'test-session' }
      }
    ]);

    const composer = page.locator('textarea[aria-label="Ask Capital One"]');
    await composer.fill('Where do I shop?');
    const send = page.locator('button.send[aria-label="Ask"]');
    await expect(send).toBeEnabled({ timeout: 30_000 });
    await composer.press('Enter');

    const turn = page.locator('.assistant-turn').last();
    const prose = turn.locator('.bubble.assistant .richtext');

    // The insight has arrived but the merchant name has not been streamed, so
    // the buffered card stays hidden above the prose.
    await expect(prose).toContainText('checked where you shop', { timeout: 10_000 });
    await expect(page.locator('.chat-panel')).toHaveAttribute('data-streaming', 'true');
    await expect(turn.locator('.merchant-card')).toHaveCount(0);
    await expect(page.locator('.loading-line')).toBeVisible();

    // Once the prose reaches the merchant name, the card reveals while pending.
    await expect(turn.locator('.merchant-card')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('.chat-panel')).toHaveAttribute('data-streaming', 'true');
    await expect(turn.locator('.merchant-card')).toContainText('Whole Foods Market');
    expect(
      await turn
        .locator('.merchant-card')
        .first()
        .evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'the buffered merchant card renders inline inside the prose bubble'
    ).toBe(true);

    await waitForChatSettled(page);
    await expect(turn.locator('.merchant-card')).toHaveCount(1);
    expectNoErrors(errors);
  });

  test('"Show me my bills" renders one primitive bill card and no duplicated totals', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Show me my bills');

    await expectCardCount(page, { min: 1, max: 1 });
    const bill = page.locator('.bill-card');
    await expect(bill).toHaveCount(1);
    await expect(bill).toHaveAttribute('data-kind', 'bill');
    await expect(page.locator('.cashflow-card')).toHaveCount(0);

    await expectNoCardValueDuplicate(page, ['$4,283.59', '$65.59']);
    await expect(bill.locator('.card-head, .badge, .eyebrow')).toHaveCount(0);
    await expectCardStyle(page);

    // The bill card shows the largest bill's payee, amount, and due date, so
    // the prose must use timing analytically instead of restating those fields.
    const prose = await assistantText(page);
    expect(prose, 'prose must not restate the card payee').not.toContain('MIT Bursar');
    expect(prose, 'prose must not restate the card amount').not.toContain('1,800');
    expect(prose, 'prose must not restate the card due date').not.toMatch(
      /2026-12-05|Dec 5/
    );
    expect(prose, 'prose uses relative timing').toMatch(
      /largest payment is due (within the next three weeks|in the coming weeks)/
    );
    expect(prose).toContain('Tip:');
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

    // The list card stays a standalone card, outside the prose bubble.
    expect(
      await lists
        .first()
        .evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'transaction-list cards are not folded into the assistant bubble'
    ).toBe(false);

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
    const kinds = await cardKinds(page);
    const text = await cardText(page);
    const mentionsVenture = /Venture/i.test(text);
    const hasRewardCard = kinds.includes('reward');
    expect(
      hasRewardCard || mentionsVenture,
      `expected a rewards card or Venture account card, got ${JSON.stringify(kinds)}`
    ).toBe(true);

    await expectNoCardValueDuplicate(page, ['24,850', '$862']);
    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('"What credit cards do I have?" answers in prose without an account list card', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'What credit cards do I have?');

    // An accounts list stays in prose: only a single-account payload renders an
    // account card, and there is no account-list primitive.
    await expect(page.locator('.account-card')).toHaveCount(0);

    const prose = await assistantText(page);
    expect(prose, 'the prose names the Venture card').toMatch(/Venture/i);
    expect(prose).not.toContain('Everyday Checking');
    expect(prose).not.toContain('Emergency Fund');

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('"Show me my recurring payments" renders one primitive recurring card', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Show me my recurring payments');

    const card = page.locator('.recurring-card');
    await expect(card).toHaveCount(1);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-kind', 'recurring');

    const text = await card.innerText();
    expect(text.length, 'the recurring card names the charge').toBeGreaterThan(0);
    expect(text, 'the average amount is shown').toMatch(/\$\d/);
    expect(text, 'the last date is shown').toMatch(/Last [A-Z][a-z]{2} \d{1,2}/);
    // Primitive: no cadence, next-date, subscription, or cancel copy.
    expect(text.toLowerCase()).not.toMatch(/subscription|cancel|cadence|next|recommend|tip:/);

    await expect(page.locator('.chat-card')).toHaveCount(0);
    await expect(page.locator('.entity-card .recurring-card')).toHaveCount(1);
    expect(
      await card.evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'the recurring card renders inline inside the prose bubble'
    ).toBe(true);

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('"Where did my money go last month?" renders a primitive spending pie', async ({ page }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Where did my money go last month?');

    const pie = page.locator('.pie-chart-card');
    await expect(pie).toHaveCount(1);
    await expect(pie).toBeVisible();
    await expect(pie).toHaveAttribute('data-kind', 'spending-pie');

    // The pie is a standalone card, not legacy chat-card chrome.
    await expect(page.locator('.chat-card')).toHaveCount(0);
    await expect(page.locator('.entity-card .pie-chart-card')).toHaveCount(1);
    expect(
      await pie.evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'the pie is standalone, not folded into the assistant bubble'
    ).toBe(false);

    // A period label plus one legend row per wedge.
    const periodText = await pie.locator('.period').innerText();
    expect(periodText).toMatch(/(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}|Last 3 months/);

    const legendRows = pie.locator('.legend-rows .legend-row');
    const legendCount = await legendRows.count();
    expect(legendCount, 'at least one category in the legend').toBeGreaterThan(0);
    expect(legendCount, 'top 5 plus Other at most').toBeLessThanOrEqual(6);

    const legendText = await pie.locator('.legend').innerText();
    expect(legendText).toMatch(/\d+%/);
    expect(legendText).toMatch(/\$/);

    const wedgeCount = await pie.locator('svg .pie-slice').count();
    expect(wedgeCount, 'one wedge per legend row').toBe(legendCount);

    // Primitive content only: no editorial labels or recommendations baked in.
    const cardText = (await pie.innerText()).toLowerCase();
    expect(cardText).not.toMatch(/top category|biggest|you spent|recommend|tip:/);
    await expect(pie.locator('.card-head, .badge, .eyebrow')).toHaveCount(0);

    // The prose carries the insight and tip, without dumping the chart values.
    const prose = (await assistantText(page)).trim();
    expect(prose.length, 'assistant prose introduces the chart').toBeGreaterThan(0);
    expect(prose).toMatch(/tip|insight|you can|worth|compare|watch/i);

    const frame = page.locator('.entity-card').filter({ has: pie });
    await expect(frame).toHaveCount(1);
    const frameStyle = await frame.evaluate((element) => ({
      shadow: getComputedStyle(element).boxShadow,
      accent: getComputedStyle(element, '::before').content,
      border: Number.parseFloat(getComputedStyle(element).borderTopWidth)
    }));
    expect(frameStyle.shadow).not.toBe('none');
    expect(['none', 'normal'], 'no ::before accent bar').toContain(frameStyle.accent);
    expect(frameStyle.border).toBeGreaterThanOrEqual(1);

    expectNoErrors(errors);
  });

  test('buffers the spending pie until its reveal point and keeps it standalone', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    const spendingPayload = {
      months: 3,
      monthlyTotals: [
        { month: '2026-09', total: 2100 },
        { month: '2026-10', total: 2470 },
        { month: '2026-11', total: 0 }
      ],
      monthlyBreakdown: [
        {
          month: '2026-09',
          total: 2100,
          transactionCount: 18,
          categories: [{ category: 'housing', total: 2100, share: 1 }]
        },
        {
          month: '2026-10',
          total: 2470,
          transactionCount: 20,
          categories: [
            { category: 'shopping', total: 1800, share: 0.7287 },
            { category: 'groceries', total: 670, share: 0.2713 }
          ]
        },
        { month: '2026-11', total: 0, transactionCount: 0, categories: [] }
      ],
      categories: [],
      totalSpend: 4570
    };

    await mockChatStream(page, [
      {
        delay: 100,
        event: 'tool_start',
        data: { type: 'tool_start', name: 'insight_spending_breakdown', label: '' }
      },
      {
        delay: 100,
        event: 'insight',
        data: {
          type: 'insight',
          kind: 'insight_spending_breakdown',
          accountId: 'acct-checking',
          payload: spendingPayload
        }
      },
      {
        delay: 1500,
        event: 'text',
        data: { type: 'text', delta: 'Here is your spending by category.' }
      },
      {
        delay: 1500,
        event: 'text',
        data: { type: 'text', delta: ' Shopping is where most of it went.' }
      },
      {
        delay: 1200,
        event: 'done',
        data: { type: 'done', sessionId: 'test-session' }
      }
    ]);

    const composer = page.locator('textarea[aria-label="Ask Capital One"]');
    await composer.fill('Where did my money go last month?');
    const send = page.locator('button.send[aria-label="Ask"]');
    await expect(send).toBeEnabled({ timeout: 30_000 });
    await composer.press('Enter');

    const turn = page.locator('.assistant-turn').last();
    const prose = turn.locator('.bubble.assistant .richtext');

    // The insight arrived before the prose introduced it; the card is buffered.
    await expect(prose).toContainText('spending by category', { timeout: 10_000 });
    await expect(page.locator('.chat-panel')).toHaveAttribute('data-streaming', 'true');
    await expect(turn.locator('.pie-chart-card')).toHaveCount(0);
    await expect(page.locator('.loading-line')).toBeVisible();

    // Once the turn completes the buffered pie appears after the prose.
    await expect(turn.locator('.pie-chart-card')).toHaveCount(1, { timeout: 10_000 });
    await waitForChatSettled(page);
    await expect(page.locator('.chat-panel')).toHaveAttribute('data-streaming', 'false');

    const pie = turn.locator('.pie-chart-card');
    expect(
      await pie.evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'the buffered pie stays a standalone card'
    ).toBe(false);
    await expect(page.locator('.chat-card')).toHaveCount(0);
    await expect(turn.locator('.bubble.assistant .pie-chart-card')).toHaveCount(0);

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
        count: 3,
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
          },
          {
            _id: 'txn-spotify',
            type: 'duplicate',
            description: 'SPOTIFY',
            amount: 9.99,
            date: '2026-11-04',
            duplicateOf: '2026-11-03'
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
        delta: ' and another duplicate at SPOTIFY: '
      })}`,
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'all three posted this week.'
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
    expect(count, 'one card per flagged transaction').toBe(3);

    for (let index = 0; index < count; index += 1) {
      await expect(cards.nth(index)).toHaveAttribute('data-kind', 'transaction');
    }

    // Cards show only the transaction: merchant and amount, never a reason chip.
    const cardsText = (await cards.allInnerTexts()).join('\n');
    expect(cardsText, 'cards name the merchant').toContain('APPLE STORE');
    expect(cardsText, 'cards name the merchant').toContain('NETFLIX.COM');
    expect(cardsText, 'cards name the merchant').toContain('SPOTIFY');
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
      expect.stringMatching(/txn=txn-netflix$/),
      expect.stringMatching(/txn=txn-spotify$/)
    ]);

    // Single transaction rows render inside the assistant bubble, not as
    // standalone CardFrame cards.
    const insideBubble = await cards.evaluateAll((elements) =>
      elements.map((element) => Boolean(element.closest('.bubble.assistant')))
    );
    expect(insideBubble.every(Boolean), 'every transaction card sits inside a bubble').toBe(true);
    await expect(page.locator('.bubble.assistant .transaction-card a.transaction-link')).toHaveCount(
      count
    );
    await expect(page.locator('.chat-card .transaction-card')).toHaveCount(0);
    await expect(page.locator('.entity-card .transaction-card')).toHaveCount(0);
    await expect(page.locator('.bubble.assistant .transaction-card .open-icon')).toHaveCount(count);

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
      const bubble = turn.querySelector('.bubble.assistant.inline-entities');
      const content = bubble ?? turn.querySelector('.assistant-content');
      if (!content) return [];
      return Array.from(content.children).flatMap((child) => {
        if (child.classList.contains('richtext')) return ['text'];
        if (child.classList.contains('transaction-card')) return ['card'];
        if (child.querySelector('.transaction-card')) return ['card'];
        if (child.querySelector('.bubble.assistant .richtext')) return ['text'];
        return [];
      });
    });
    expect(order, 'text → card → text → card → text → card → text ordering').toEqual([
      'text',
      'card',
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

  test('"Find an ATM near Arlington" renders one primitive location card', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Find an ATM near Arlington');

    const card = page.locator('.atm-locator-card');
    await expect(card).toHaveCount(1);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-kind', 'location');

    await expect(card.locator('.name')).toContainText('Arlington');
    await expect(card.locator('.hours')).not.toBeEmpty();

    const text = await card.innerText();
    expect(text).toContain('Arlington');
    // Primitive: no recommendation or directions copy.
    expect(text.toLowerCase()).not.toMatch(/recommend|tip:|directions/);

    // The map is a server-proxied Mapbox Static Images <img>, never a keyless
    // OSM iframe and never a URL carrying the token.
    await expect(card.locator('iframe.atm-map')).toHaveCount(0);
    const map = card.locator('img.atm-map');
    await expect(map).toHaveCount(1);
    const src = await map.getAttribute('src');
    expect(src).toMatch(/^\/api\/mapbox\/static\?/);
    expect(src).toContain('lat=');
    expect(src).toContain('lng=');
    expect(src?.toLowerCase()).not.toContain('access_token');
    expect(src?.toLowerCase()).not.toContain('mapbox.com');
    expect(await card.innerHTML()).not.toContain('access_token');
    expect(await card.innerHTML()).not.toContain('mapbox.com');
    expect(await card.innerHTML()).not.toContain('openstreetmap.org');

    // Standalone card: the ATM map is not folded into the assistant bubble.
    await expect(page.locator('.bubble.assistant .atm-locator-card')).toHaveCount(0);
    expect(
      await card.evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'the ATM locator map renders as a standalone card, not inside the prose bubble'
    ).toBe(false);

    // The Apple/Google actions sit below the map card, outside its surface and
    // outside the prose bubble.
    const actions = page.locator('.atm-actions');
    await expect(actions).toHaveCount(1);
    await expect(actions).toBeVisible();
    await expect(page.locator('.entity-card .atm-actions')).toHaveCount(0);
    expect(
      await actions.evaluate((element) => ({
        inCard: Boolean(element.closest('.entity-card')),
        inBubble: Boolean(element.closest('.bubble.assistant'))
      })),
      'the actions row sits outside both the map card and the prose bubble'
    ).toEqual({ inCard: false, inBubble: false });

    // The explicit external links open Apple Maps and Google Maps.
    const apple = actions.getByRole('link', { name: 'Open in Apple Maps', exact: true });
    await expect(apple).toHaveCount(1);
    const appleHref = await apple.getAttribute('href');
    expect(appleHref).not.toBeNull();
    expect(new URL(appleHref as string).host).toBe('maps.apple.com');
    expect(appleHref).toContain('ll=');
    expect(appleHref).toContain('q=');
    await expect(apple).toHaveAttribute('target', '_blank');
    expect(await apple.getAttribute('rel')).toContain('noopener');

    const google = actions.getByRole('link', { name: 'Open in Google Maps', exact: true });
    await expect(google).toHaveCount(1);
    const googleHref = await google.getAttribute('href');
    expect(googleHref).not.toBeNull();
    const googleUrl = new URL(googleHref as string);
    expect(googleUrl.host).toBe('www.google.com');
    expect(googleUrl.pathname).toBe('/maps/search/');
    expect(googleUrl.searchParams.get('api')).toBe('1');
    expect(googleUrl.searchParams.get('query')).toContain(',');
    await expect(google).toHaveAttribute('target', '_blank');
    expect(await google.getAttribute('rel')).toContain('noopener');

    // Both buttons are equal-width halves of the 88% card row (8px gap).
    const [frameBox, appleBox, googleBox] = await Promise.all([
      card.locator('xpath=..').boundingBox(),
      apple.boundingBox(),
      google.boundingBox()
    ]);
    expect(frameBox, 'the map card is laid out').not.toBeNull();
    expect(appleBox, 'the Apple Maps button is laid out').not.toBeNull();
    expect(googleBox, 'the Google Maps button is laid out').not.toBeNull();
    expect(
      Math.abs(appleBox!.width - googleBox!.width),
      'the two action buttons have equal widths'
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(appleBox!.y - googleBox!.y),
      'the two action buttons sit side by side'
    ).toBeLessThanOrEqual(2);
    const expectedHalf = (frameBox!.width - 8) / 2;
    expect(
      Math.abs(appleBox!.width - expectedHalf),
      'the Apple button is about half the card width'
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(googleBox!.width - expectedHalf),
      'the Google button is about half the card width'
    ).toBeLessThanOrEqual(2);
    expect(Math.abs(appleBox!.x - frameBox!.x)).toBeLessThanOrEqual(2);
    expect(
      Math.abs(googleBox!.x + googleBox!.width - (frameBox!.x + frameBox!.width)),
      'the actions row spans the card width'
    ).toBeLessThanOrEqual(2);

    await expect(actions.getByRole('link', { name: 'Open in OpenStreetMap' })).toHaveCount(0);
    expect(await page.locator('.atm-locator').innerText()).not.toContain('Open in OpenStreetMap');
    await expect(card.locator('iframe')).toHaveCount(0);
    await expect(page.locator('.location-card')).toHaveCount(0);

    await expect(page.locator('.chat-card')).toHaveCount(0);
    await expect(page.locator('.entity-card .atm-locator-card')).toHaveCount(1);

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('"Find an ATM near Cambridge, MA" is honest about distant results', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Find an ATM near Cambridge, MA');

    const prose = await assistantText(page);
    expect(prose).toContain("couldn't find any ATMs within 25 miles");
    expect(prose).toMatch(/closest option is [\d,]+ miles away/);
    expect(prose).toMatch(/straight-line/i);
    expect(prose).not.toMatch(/ATMs near/i);
    expect(prose).not.toMatch(/near "Cambridge/i);

    // The nearest ATM still renders its map card, even though it is far away.
    const card = page.locator('.atm-locator-card');
    await expect(card).toHaveCount(1);
    expect(
      await card.evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'the distant ATM map is standalone, not inside the prose bubble'
    ).toBe(false);
    const map = card.locator('img.atm-map');
    await expect(map).toHaveCount(1);
    const src = await map.getAttribute('src');
    expect(src).toMatch(/^\/api\/mapbox\/static\?/);
    await expect(card.locator('.distance')).toContainText('mi away');

    expectNoErrors(errors);
  });

  test('a branch prompt renders an address when the data has one', async ({ page }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Find a branch in Arlington');

    const card = page.locator('.location-card');
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute('data-kind', 'location');
    await expect(card.locator('.name')).not.toBeEmpty();
    await expect(card.locator('.address')).not.toBeEmpty();
    expect(
      await card.evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'branch location cards stay inline inside the prose bubble'
    ).toBe(true);

    expectNoErrors(errors);
  });

  test('"Give me a snapshot of my finances" renders one primitive cashflow month', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Give me a snapshot of my finances');

    await expectCardCount(page, { min: 1, max: 4 });
    await expect(page.locator('.cashflow-card')).toHaveCount(1);
    await expect(page.locator('.cashflow-card')).toHaveAttribute('data-kind', 'cashflow');

    await expectCardStyle(page);
    expectNoErrors(errors);
  });

  test('profile questions return a primitive profile card or text answer', async ({ page }) => {
    const errors = collectErrors(page);
    await runPrompt(page, 'Show me my profile');

    await expect
      .poll(
        async () =>
          (await cardShells(page).count()) > 0 || (await assistantText(page)).trim().length > 0,
        { timeout: 20_000 }
      )
      .toBe(true);

    const kinds = await cardKinds(page);
    const text = await cardText(page);
    const prose = await assistantText(page);
    const hasProfileCard = kinds.includes('profile');
    const mentionsMaya = /Maya/i.test(text) || /Maya/i.test(prose);
    expect(
      hasProfileCard || mentionsMaya || prose.trim().length > 0,
      'profile prompt should produce a profile card or a text answer'
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
    const loan = page.locator('.loan-card');
    await expect(loan).toHaveCount(1);

    const surface = await page
      .locator('.entity-card')
      .filter({ has: loan })
      .evaluate((card) => {
        const style = getComputedStyle(card);
        const accent = getComputedStyle(card, '::before');
        return {
          shadow: style.boxShadow,
          borderTopWidth: Number.parseFloat(style.borderTopWidth),
          accentContent: accent.content
        };
      });
    expect(surface.shadow, 'inline cards lose the standalone lift').toBe('none');
    expect(surface.borderTopWidth).toBeGreaterThanOrEqual(1);
    expect(['none', 'normal'], 'no ::before accent bar').toContain(surface.accentContent);

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


test.describe('primitive bill and account cards', () => {
  test('"Show me my bills" renders one primitive bill card and no legacy chrome', async ({
    page
  }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    const events = [
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'The largest bill is City Power: '
      })}`,
      `event: insight\ndata: ${JSON.stringify({
        type: 'insight',
        kind: 'insight_upcoming_bills',
        payload: {
          asOf: '2026-11-14',
          days: 30,
          count: 2,
          total: 3120,
          coverageRatio: 1.4,
          shortfall: 0,
          bills: [
            {
              billId: 'bill-rent',
              payee: 'Maple Property',
              nickname: 'Rent',
              amount: 3000,
              dueDate: '2026-11-20',
              daysUntil: 6,
              status: 'pending',
              accountId: 'acct-checking'
            },
            {
              billId: 'bill-power',
              payee: 'City Power',
              nickname: 'Utilities',
              amount: 120,
              dueDate: '2026-11-18',
              daysUntil: 4,
              status: 'pending',
              accountId: 'acct-checking'
            }
          ]
        }
      })}`,
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'it is the largest item in the window.'
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

    const bill = page.locator('.bill-card');
    await expect(bill).toHaveCount(1, { timeout: 20_000 });
    await expect(bill).toBeVisible();
    await expect(bill).toHaveAttribute('data-kind', 'bill');

    const text = await bill.innerText();
    // The largest bill wins even though it is not the earliest.
    expect(text).toContain('Maple Property');
    expect(text).not.toContain('City Power');
    expect(text, 'amount is shown').toContain('$3,000.00');
    expect(text, 'due date is shown').toMatch(/Nov 20/);
    expect(text, 'factual status is shown').toContain('Pending');

    // Primitive: no coverage, total, insight, or recommendation copy.
    expect(text.toLowerCase()).not.toMatch(/coverage|covered|shortfall|recommend|insight|top bill/);
    await expect(page.locator('.chat-card')).toHaveCount(0);
    await expect(bill.locator('.card-head, .badge, .eyebrow')).toHaveCount(0);
    await expect(page.locator('.entity-card .bill-card')).toHaveCount(1);
    expect(
      await bill.evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'the bill card renders inline inside the prose bubble'
    ).toBe(true);

    // It deep-links to the owning account when the ids are present.
    const link = bill.locator('a.bill-link');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('href', /^\/dashboard\?customer=[^&]+&account=acct-checking$/);
    await expect(bill.locator('.open-icon')).toBeVisible();

    expectNoErrors(errors);
  });

  test('an accounts list stays in prose and renders no account list card', async ({ page }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    const events = [
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'You have two accounts: Everyday Checking and Venture card.'
      })}`,
      `event: insight\ndata: ${JSON.stringify({
        type: 'insight',
        kind: 'nessie_list_customer_accounts',
        payload: {
          count: 2,
          accounts: [
            {
              _id: 'acct-checking',
              nickname: 'Everyday Checking',
              type: 'Checking',
              accountNumber: '•••• 4212',
              balance: 4218,
              rewards: 0,
              customerId: 'cust-test'
            },
            {
              _id: 'acct-venture',
              nickname: 'Venture',
              type: 'Credit Card',
              accountNumber: '•••• 7788',
              balance: 862,
              rewards: 24850,
              customerId: 'cust-test'
            }
          ]
        }
      })}`,
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'Your checking account covers everyday spending.'
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

    await askChat(page, 'What accounts do I have?');

    await expect(page.locator('.account-card')).toHaveCount(0);
    // No legacy account-list card either.
    await expect(page.locator('.chat-card')).toHaveCount(0);
    const prose = (await assistantText(page)).trim();
    expect(prose.length, 'the prose answers the account question').toBeGreaterThan(0);
    expect(prose).toMatch(/Everyday Checking|Venture/);

    expectNoErrors(errors);
  });

  test('a single-account payload renders one account card with a deep link', async ({ page }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    const events = [
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'Here is your Everyday Checking account: '
      })}`,
      `event: insight\ndata: ${JSON.stringify({
        type: 'insight',
        kind: 'nessie_get_account',
        payload: {
          _id: 'acct-checking',
          nickname: 'Everyday Checking',
          type: 'Checking',
          accountNumber: '12345678904212',
          balance: 4218,
          rewards: 0,
          customerId: 'cust-test',
          extra: 'do not leak'
        }
      })}`,
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: 'you can open it to review recent activity.'
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

    await askChat(page, 'Tell me about my checking account');

    const card = page.locator('.account-card');
    await expect(card).toHaveCount(1, { timeout: 20_000 });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-kind', 'account');

    const text = await card.innerText();
    expect(text).toContain('Everyday Checking');
    expect(text).toContain('Checking');
    expect(text).toContain('•••• 4212');
    expect(text, 'balance is shown').toContain('$4,218.00');
    expect(text, 'a zero rewards balance is not shown as an offer').not.toMatch(/0 points/);

    await expect(page.locator('.chat-card')).toHaveCount(0);
    await expect(card.locator('.card-head, .badge, .eyebrow')).toHaveCount(0);
    expect(
      await card.evaluate((element) => Boolean(element.closest('.bubble.assistant'))),
      'the account card renders inline inside the prose bubble'
    ).toBe(true);

    const link = card.locator('a.account-link');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute(
      'href',
      '/dashboard?customer=cust-test&account=acct-checking'
    );
    await expect(card.locator('.open-icon')).toBeVisible();

    expectNoErrors(errors);
  });

  test('a synthetic card SSE event renders the normalized primitive inline', async ({ page }) => {
    const errors = collectErrors(page);
    await loadChat(page);

    const intro = 'Your checking account is below.';
    const events = [
      `event: text\ndata: ${JSON.stringify({ type: 'text', delta: intro })}`,
      `event: card\ndata: ${JSON.stringify({
        type: 'card',
        card: {
          id: 1,
          entityId: 'account:acct-checking',
          kind: 'account',
          afterText: intro.length,
          payload: {
            accountId: 'acct-checking',
            nickname: 'Everyday Checking',
            type: 'Checking',
            maskedNumber: '•••• 4212',
            balance: 4218,
            rewards: 0,
            customerId: 'cust-test'
          }
        }
      })}`,
      `event: text\ndata: ${JSON.stringify({
        type: 'text',
        delta: ' You can open it to review recent activity.'
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

    await askChat(page, 'Tell me about my checking account');

    const card = page.locator('.account-card');
    await expect(card).toHaveCount(1, { timeout: 20_000 });
    await expect(card).toContainText('Everyday Checking');
    await expect(card).toContainText('•••• 4212');
    await expect(page.locator('.chat-card')).toHaveCount(0);

    expectNoErrors(errors);
  });
});
