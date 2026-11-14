import { expect, type Page } from '@playwright/test';

export interface CollectedErrors {
  pageErrors: string[];
  consoleErrors: string[];
  apiErrors: string[];
}

/**
 * Attach listeners that record page exceptions, console errors, and failed or
 * 5xx /api responses. Call before the first navigation.
 */
export function collectErrors(page: Page): CollectedErrors {
  const errors: CollectedErrors = {
    pageErrors: [],
    consoleErrors: [],
    apiErrors: []
  };

  page.on('pageerror', (error) => {
    errors.pageErrors.push(error.stack || error.message);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.consoleErrors.push(message.text());
    }
  });

  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('/api/')) return;
    if (response.status() >= 500) {
      errors.apiErrors.push(`${response.status()} ${response.request().method()} ${url}`);
    }
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!url.includes('/api/')) return;
    errors.apiErrors.push(
      `FAILED ${request.method()} ${url} — ${request.failure()?.errorText ?? 'unknown error'}`
    );
  });

  return errors;
}

/** Assert the page produced no errors at all (message lists every category). */
export function expectNoErrors(errors: CollectedErrors): void {
  expect(
    errors.pageErrors,
    `Unexpected page errors:\n${errors.pageErrors.join('\n---\n')}`
  ).toEqual([]);
  expect(
    errors.consoleErrors,
    `Unexpected console errors:\n${errors.consoleErrors.join('\n---\n')}`
  ).toEqual([]);
  expect(
    errors.apiErrors,
    `Unexpected API errors (5xx/failed):\n${errors.apiErrors.join('\n---\n')}`
  ).toEqual([]);
}

/** Wait for the top composer to be ready to send another message. */
export async function waitForComposerReady(page: Page): Promise<void> {
  const composer = page.locator('textarea[aria-label="Ask Capital One"]');
  await expect(composer).toBeVisible({ timeout: 30_000 });

  // canSend flips true once the chat session exists. Filling the composer
  // enables the send button only when the panel is ready, so poll for that.
  await composer.fill('ready?');
  try {
    await expect(page.locator('button.send[aria-label="Ask"]')).toBeEnabled({
      timeout: 30_000
    });
  } finally {
    await composer.fill('');
  }
}

/**
 * Wait for an in-flight assistant turn to settle: the SSE stream has ended,
 * no pending status line remains, and the last turn's text has stopped
 * changing across two samples.
 */
export async function waitForChatSettled(page: Page): Promise<void> {
  // Wait until the panel reports the stream has ended before sampling text.
  await page
    .waitForFunction(
      () => document.querySelector('.chat-panel')?.getAttribute('data-streaming') === 'false',
      undefined,
      { timeout: 20_000 }
    )
    .catch(() => undefined);

  // The pending status line disappears on `done`.
  await page
    .waitForFunction(() => !document.querySelector('.chat-log .status-line'), undefined, {
      timeout: 20_000
    })
    .catch(() => undefined);

  const turn = page.locator('.assistant-turn').last();
  if ((await turn.count()) === 0) return;

  let previous = '';
  for (let sample = 0; sample < 40; sample += 1) {
    const current = (await turn.innerText().catch(() => '')).trim();
    if (current.length > 0 && current === previous) {
      await page.waitForTimeout(250);
      return;
    }
    previous = current;
    await page.waitForTimeout(250);
  }
}

/**
 * Send a prompt through the shared top composer and wait for the request to
 * finish and the assistant turn to settle.
 */
export async function askChat(page: Page, prompt: string): Promise<void> {
  const composer = page.locator('textarea[aria-label="Ask Capital One"]');
  await expect(composer).toBeVisible({ timeout: 30_000 });

  const send = page.locator('button.send[aria-label="Ask"]');
  await composer.fill(prompt);
  await expect(send).toBeEnabled({ timeout: 30_000 });

  const chatResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/chat') && response.request().method() === 'POST',
    { timeout: 55_000 }
  );

  await composer.press('Enter');

  const response = await chatResponse;
  expect(response.status(), 'chat request should succeed').toBeLessThan(400);
  await response.finished().catch(() => undefined);

  await waitForChatSettled(page);
}

/** Titles rendered in card headers, in DOM order. */
export async function cardTitles(page: Page): Promise<string[]> {
  const titles = await page.locator('.chat-card .card-head h3').allInnerTexts();
  return titles.map((title) => title.trim()).filter(Boolean);
}

/** Count of rendered card shells. */
export function cardShells(page: Page) {
  return page.locator('.chat-card');
}

/** Concatenated text of every rendered card. */
export async function cardText(page: Page): Promise<string> {
  return (await page.locator('.chat-card').allInnerTexts()).join('\n');
}

/** Rendered markdown of assistant bubbles. */
export async function assistantText(page: Page): Promise<string> {
  return (await page.locator('.bubble.assistant .richtext').allInnerTexts()).join('\n');
}

/**
 * Card style/label contract: no uppercase eyebrow chips, and no header that
 * just repeats internal naming such as "Rewards points".
 */
export async function expectCardStyle(page: Page): Promise<void> {
  expect(
    await page.locator('.chat-card .eyebrow').count(),
    'cards must not render eyebrow labels'
  ).toBe(0);

  for (const title of await cardTitles(page)) {
    expect(title.toLowerCase(), 'card titles should be product language').not.toBe(
      'rewards points'
    );
  }

  const surfaces = await page.locator('.chat-card').evaluateAll((cards) =>
    cards.map((card) => {
      const style = getComputedStyle(card);
      const accent = getComputedStyle(card, '::before');
      return {
        shadow: style.boxShadow,
        borderTopWidth: Number.parseFloat(style.borderTopWidth),
        accentHeight: Number.parseFloat(accent.height)
      };
    })
  );

  for (const surface of surfaces) {
    expect(surface.shadow, 'cards should lift off the chat surface').not.toBe('none');
    expect(surface.borderTopWidth, 'cards need a visible border').toBeGreaterThanOrEqual(1);
    expect(surface.accentHeight, 'cards need a 3px accent strip').toBeGreaterThan(2);
    expect(surface.accentHeight, 'cards need a 3px accent strip').toBeLessThan(4);
  }
}

/**
 * Card values must not be repeated in the assistant prose. `values` are the
 * exact strings the cards are already showing (e.g. "24,850", "$862").
 */
export async function expectNoCardValueDuplicate(
  page: Page,
  values: readonly string[]
): Promise<void> {
  const prose = await assistantText(page);
  for (const value of values) {
    expect(prose, `assistant prose should not repeat card value ${value}`).not.toContain(value);
  }
}

/** Poll until the card shell count satisfies an expectation. */
export async function expectCardCount(
  page: Page,
  expected: number | { min?: number; max?: number },
  timeout = 30_000
): Promise<void> {
  await expect
    .poll(
      async () => {
        const count = await cardShells(page).count();
        if (typeof expected === 'number') return count === expected;
        if (expected.min !== undefined && count < expected.min) return false;
        if (expected.max !== undefined && count > expected.max) return false;
        return true;
      },
      { timeout }
    )
    .toBe(true);
}

export const MAYA = {
  id: 'dfdeef2a-b163-42ac-86e4-4c4a277ee97c',
  name: 'Maya Chen',
  first: 'Maya'
} as const;

export const JORDAN = {
  id: '4bebbd39-b51d-4546-b606-6fa48495fba0',
  name: 'Jordan Lee',
  first: 'Jordan'
} as const;
