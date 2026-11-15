import { expect, test, type Page } from '@playwright/test';

async function mockProfile(page: Page) {
  const customer = { id: 'maya', firstName: 'Maya', lastName: 'Chen' };
  await page.route('**/api/customers', (route) => route.fulfill({ json: { customers: [customer] } }));
  await page.route('**/api/session', (route) => route.fulfill({ json: { customer, accounts: [] } }));
  await page.route('**/api/accounts', (route) => route.fulfill({ json: { customer, accounts: [], bills: [], loans: [], recentActivity: [] } }));
  await page.route('**/api/overview', (route) => route.fulfill({ json: {} }));
}

async function ask(page: Page, text: string) {
  const composer = page.getByRole('textbox', { name: 'Ask Capital One' });
  await composer.fill(text);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
}

test('uses the same composer styling before and after opening chat', async ({ page }) => {
  await mockProfile(page);
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: 'event: text\ndata: {"type":"text","delta":"Hello!"}\n\n'
    })
  );
  await page.goto('/dashboard?customer=maya');
  await expect(page.locator('.profile-name')).toHaveText('Maya');
  const composer = page.locator('form.composer');
  const field = composer.getByRole('textbox');
  const send = composer.getByRole('button', { name: 'Ask' });
  const initialPlaceholder = 'Ask about your money, spending, or bills…';

  await expect(field).toHaveAttribute('placeholder', initialPlaceholder);
  await expect(send).toHaveText('↑');
  const styles = () =>
    composer.evaluate((form) => ({
      field: getComputedStyle(form).background,
      button: getComputedStyle(form.querySelector('button')!).backgroundColor
    }));
  const dashboardStyles = await styles();

  await field.click();
  await expect(page).toHaveURL(/\/chat(?:\?|$)/);
  await expect(field).toHaveAttribute('placeholder', initialPlaceholder);
  expect(await styles()).toEqual(dashboardStyles);
  await expect(send).toHaveText('↑');

  await field.fill('Hello Eno');
  await expect(field).toHaveAttribute('placeholder', initialPlaceholder);
  await field.press('Enter');
  await expect(field).toHaveAttribute('placeholder', 'Message Eno…');
});

test('every suspicious charge receives its own reason even when model prose is only a list', async ({ page }) => {
  await mockProfile(page);
  const events = [
    { type: 'text', delta: 'Please review these charges: CAFE, LOCAL BOOKSTORE and STREAMING SERVICE.' },
    { type: 'insight', kind: 'insight_anomalies', accountId: 'checking', payload: { count: 3, findings: [
      { _id: 'a', type: 'outlier', description: 'CAFE', amount: 1800, date: '2026-11-01', reason: "much larger than this merchant's usual purchases" },
      { _id: 'b', type: 'duplicate', description: 'LOCAL BOOKSTORE', amount: 47, date: '2026-11-02', duplicateOf: '2026-11-01' },
      { _id: 'c', type: 'duplicate', description: 'STREAMING SERVICE', amount: 19, date: '2026-11-03', duplicateOf: '2026-11-02' }
    ] } },
    { type: 'done', sessionId: 'demo-session' }
  ];
  await page.route('**/api/chat', (route) => route.fulfill({ contentType: 'text/event-stream', body: events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('') }));
  await page.goto('/chat?customer=maya');
  await ask(page, 'Any suspicious charges?');
  const turn = page.locator('.assistant-turn').last();
  await expect(turn.locator('.transaction-card')).toHaveCount(3);
  await expect(turn).toContainText('CAFE is an unusually large purchase compared with your usual purchases at this merchant.');
  await expect(turn).toContainText('LOCAL BOOKSTORE is a possible duplicate because the same merchant charged the same amount again within three days.');
  await expect(turn).toContainText('STREAMING SERVICE is a possible duplicate because the same merchant charged the same amount again within three days.');
  await expect(turn).not.toContainText('confirmed fraud');
});

test('bill cards wait for their complete context and follow their own paragraphs', async ({ page }) => {
  await mockProfile(page);
  const first = 'City Power is next. Your checking balance covers this payment.';
  const second = 'Rent follows later. You can check your lease before scheduling it.';
  const card = (id: number, payee: string) => ({ type: 'card', card: { id, kind: 'bill', entityId: `bill:${id}`, afterText: 0, payload: { billId: String(id), payee, amount: id * 100, dueDate: '2026-11-20' } } });
  const chunks = [
    { delay: 0, data: { type: 'text', delta: 'City Power' } }, { delay: 0, data: card(1, 'City Power') },
    { delay: 700, data: { type: 'text', delta: first.slice('City Power'.length) + '\n\nRent' } },
    { delay: 0, data: card(2, 'Rent') },
    { delay: 700, data: { type: 'text', delta: second.slice('Rent'.length) + '\n\nYou can review both payments.' } },
    { delay: 0, data: { type: 'done', sessionId: 'demo-session' } }
  ];
  await page.addInitScript((chunks) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.includes('/api/chat')) return originalFetch(input, init);
      return Promise.resolve(new Response(new ReadableStream({ async start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) {
          await new Promise((resolve) => setTimeout(resolve, chunk.delay));
          controller.enqueue(encoder.encode(`event: ${chunk.data.type}\ndata: ${JSON.stringify(chunk.data)}\n\n`));
        }
        controller.close();
      } }), { headers: { 'content-type': 'text/event-stream' } }));
    };
  }, chunks);
  await page.goto('/chat?customer=maya');
  await ask(page, 'Show my bills');
  const turn = page.locator('.assistant-turn').last();
  await expect(turn.locator('.richtext')).toContainText(['City Power']);
  await expect(turn.locator('.bill-card')).toHaveCount(0);
  await expect(turn.locator('.bill-card')).toHaveCount(2);
  const order = await turn.locator('.bubble.assistant').evaluate((bubble) => Array.from(bubble.children).map((element) => ({ text: element.textContent?.trim(), card: element.querySelector('.bill-card') !== null || element.classList.contains('bill-card') })));
  expect(order.map((entry) => entry.card)).toEqual([false, true, false, true, false]);
  expect(order[0].text).toBe(first);
  expect(order[2].text).toBe(second);
});
