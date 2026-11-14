import { expect, test, type Page } from '@playwright/test';

const answers = { first_name: 'Ada', last_name: 'Lovelace', street_number: '123', street_name: 'Main St', city: 'Boston', state: 'MA', zip: '02139' };
const skipSpending = { status: 'skip', categories: [] };
const customer = { id: 'new-ada', firstName: 'Ada', lastName: 'Lovelace', city: 'Boston', state: 'MA' };
async function say(page: Page, message: string) {
  await page.getByRole('combobox', { name: 'Message Eno' }).fill(message);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
}

test('starts immediately as a freeform chat, keeps details through questions, then opens an empty dashboard', async ({ page }) => {
  const turns: Record<string, unknown>[] = [];
  let signupBody: unknown;
  await page.route('**/api/signup/chat', async (route) => {
    const body = route.request().postDataJSON(); turns.push(body);
    const choice = /no accounts/i.test(body.message) || body.accountChoice === 'none' ? 'none' : 'undecided';
    await route.fulfill({ json: { message: choice === 'none' ? 'A fresh dashboard it is. Take a look at your details.' : turns.length === 1 ? 'Nice to meet you, Ada. Want checking, savings, both, or no accounts yet?' : 'Checking is for everyday spending; savings is for setting money aside. You can choose either, both, or neither.', answers, spending: skipSpending, accountChoice: choice, ready: choice === 'none', confirmed: body.message === 'Looks good' } });
  });
  await page.route('**/api/signup', (route) => { signupBody = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { customerId: customer.id, created: true } }); });
  await page.route('**/api/customers*', (route) => route.fulfill({ json: { customers: route.request().url().includes('?customer=') ? [customer] : [{ id: 'maya', firstName: 'Maya', lastName: 'Chen' }] } }));
  await page.route('**/api/session', (route) => route.fulfill({ json: route.request().method() === 'GET' ? { customer } : { customer, accounts: [] } }));
  await page.route('**/api/accounts', (route) => route.fulfill({ json: { customer, accounts: [], bills: [], loans: [], recentActivity: [] } }));
  await page.route('**/api/overview', (route) => route.fulfill({ json: { overview: { totalRewards: 0 } } }));
  await page.goto('/signup');
  await expect(page.getByRole('combobox', { name: 'Message Eno' })).toBeFocused();
  await expect(page.getByText('What should I call you?', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Let’s do this' })).toHaveCount(0);
  await say(page, 'I’m Ada Lovelace, at 123 Main St, Boston, masachusets 02139');
  await expect(page.getByText('Nice to meet you, Ada.', { exact: false })).toBeVisible();
  await say(page, 'What is the difference between checking and savings?');
  await expect(page.getByText('Checking is for everyday spending', { exact: false })).toBeVisible();
  expect(turns[1].answers).toEqual(answers);
  await say(page, 'No accounts yet');
  await expect(page.getByLabel('Your profile')).toContainText('MA');
  await expect(page.getByLabel('Your profile')).toContainText('None yet');
  const enoMessages = page.locator('.message:not(.from-you):not(.typing)');
  await expect(page.locator('.message-avatar img[alt="Eno"]')).toHaveCount(await enoMessages.count());
  expect(signupBody).toBeUndefined();
  await say(page, 'Looks good');
  await expect(page).toHaveURL(/dashboard\?customer=new-ada$/);
  expect(signupBody).toEqual({ first_name: 'Ada', last_name: 'Lovelace', address: { street_number: '123', street_name: 'Main St', city: 'Boston', state: 'MA', zip: '02139' }, accountChoice: 'none', spending: skipSpending });
  await expect(page.locator('.profile-name')).toHaveText('Ada');
  await expect(page.locator('.welcome-empty')).toContainText('Welcome to your fresh start, Ada.');
  await expect(page.locator('article.account')).toHaveCount(0);
  await expect(page.getByText('CreditWise', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Explore rewards and benefits', { exact: true })).toHaveCount(0);
});

test('a failed model reply can be retried without losing the conversation', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/signup/chat', (route) => {
    calls += 1;
    return route.fulfill(calls === 1 ? { status: 502, json: { error: 'I lost my train of thought.' } } : { json: { message: 'Nice to meet you, Ada. What’s your last name?', answers: { ...answers, last_name: '', street_number: '', street_name: '', city: '', state: '', zip: '' }, spending: skipSpending, accountChoice: 'undecided', ready: false, confirmed: false } });
  });
  await page.goto('/signup');
  await say(page, 'Ada');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Nice to meet you, Ada.', { exact: false })).toBeVisible();
  await expect(page.locator('.from-you')).toHaveCount(1);
});

test('Eno appears beside each of his messages, can speak, and fits on mobile', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [], cancel: () => {},
      speak: (utterance: SpeechSynthesisUtterance) => { document.documentElement.setAttribute('data-spoken-text', utterance.text); utterance.dispatchEvent(new Event('start')); }
    } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/signup');
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await expect(page.locator('.message-avatar img[alt="Eno"]')).toBeVisible();
  await page.getByRole('button', { name: 'Enable Eno voice', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-spoken-text', /What should I call you/);
  await expect(page.getByRole('button', { name: 'Mute Eno voice', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('combobox', { name: 'Message Eno' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('address suggestions support keyboard selection and become part of the Eno conversation', async ({ page }) => {
  const address = { street_number: '4600', street_name: 'Silver Hill Rd', city: 'Washington', state: 'DC', zip: '20233' };
  const candidate = { id: 'demo-address', label: '4600 Silver Hill Rd, Washington, DC 20233', address };
  let sent: Record<string, unknown> | undefined;
  await page.route('**/api/addresses/search', (route) => route.fulfill({ json: { suggestions: [candidate] } }));
  await page.route('**/api/signup/chat', (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ json: { message: 'Got it. Would you like checking, savings, both, or neither?', answers: { ...answers, ...address }, spending: skipSpending, accountChoice: 'undecided', ready: false, confirmed: false, addressCheck: { status: 'matched', message: 'Street address matched.', address } } });
  });
  await page.goto('/signup');
  const composer = page.getByRole('combobox', { name: 'Message Eno' });
  await composer.fill('4600 Silver Hill');
  await expect(page.getByRole('option', { name: candidate.label })).toBeVisible();
  await composer.press('ArrowDown');
  await composer.press('Enter');
  await expect(page.getByText('Got it.', { exact: false })).toBeVisible();
  expect(sent?.selectedAddress).toEqual(address);
  await expect(page.locator('.from-you')).toContainText(candidate.label);
  await expect(composer).toHaveValue('');
});

test('a rejected address shows corrections and cannot create a profile', async ({ page }) => {
  let created = false;
  const candidate = { id: 'correction', label: '123 Main St, Cambridge, MA 02139', address: { ...answers, city: 'Cambridge' } };
  await page.route('**/api/signup/chat', (route) => route.fulfill({ json: { message: 'I found a close match. Is this your address?', answers, spending: skipSpending, accountChoice: 'both', ready: false, confirmed: false, addressCheck: { status: 'correction', message: 'Check your address', candidates: [candidate] } } }));
  await page.route('**/api/signup', (route) => { created = true; return route.fulfill({ status: 500 }); });
  await page.goto('/signup');
  await say(page, 'My address is 123 Main St, Boston MA 02139. Both accounts please.');
  await expect(page.getByRole('button', { name: candidate.label })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Looks good. Let’s go' })).toHaveCount(0);
  expect(created).toBe(false);
});

test('asks spending priorities after account choice and creates the matching demo card only after review', async ({ page }) => {
  const spending = { status: 'personalize', categories: ['dining', 'groceries'] };
  const card = { id: 'savor', name: 'Savor', nickname: 'Savor · Eno demo', reason: 'Dining comes first for you.' };
  let createdBody: Record<string, unknown> | undefined;
  const turns: Record<string, unknown>[] = [];
  await page.route('**/api/signup/chat', (route) => {
    const body = route.request().postDataJSON(); turns.push(body);
    const personalized = /dining/i.test(body.message) || body.spending.status === 'personalize';
    return route.fulfill({ json: { message: personalized ? 'Savor is your demo match. Check your choices below.' : 'Both it is. What spending matters most to you—food, travel, shopping, or something else?', answers, accountChoice: 'both', spending: personalized ? spending : { status: 'undecided', categories: [] }, card: personalized ? card : null, ready: personalized, confirmed: false, addressCheck: { status: 'matched', message: 'Street address matched.' } } });
  });
  await page.route('**/api/signup', (route) => { createdBody = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { customerId: customer.id, created: true } }); });
  await page.route('**/api/customers*', (route) => route.fulfill({ json: { customers: [customer] } }));
  await page.route('**/api/session', (route) => route.fulfill({ json: { customer, accounts: [] } }));
  await page.route('**/api/accounts', (route) => route.fulfill({ json: { customer, accounts: [{ id: 'card-id', type: 'Credit Card', nickname: card.nickname, balance: 2560, rewards: 5000, accountNumber: '', customerId: customer.id }], bills: [], loans: [], recentActivity: [] } }));
  await page.route('**/api/overview', (route) => route.fulfill({ json: { overview: { totalRewards: 5000 } } }));
  await page.goto('/signup');
  await say(page, 'I’m Ada Lovelace at 123 Main St, Boston MA 02139. Both checking and savings please.');
  await expect(page.getByText('What spending matters most', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Your profile')).toHaveCount(0);
  await say(page, 'Dining is most important, then groceries.');
  await expect(page.locator('.card-match')).toContainText('Savor');
  await expect(page.locator('.card-match')).toContainText('100 fictional transactions');
  await expect(page.getByLabel('Your profile')).toContainText('Dining · Groceries');
  expect(createdBody).toBeUndefined();
  expect(turns[1].accountChoice).toBe('both');
  await page.getByRole('button', { name: 'Looks good. Let’s go' }).click();
  await expect(page).toHaveURL(/dashboard\?customer=new-ada$/);
  expect(createdBody?.spending).toEqual(spending);
  await expect(page.locator('article.account')).toContainText('Savor · Eno demo');
  await expect(page.locator('article.account')).toContainText('2560');
  await expect(page.locator('.reward-amount')).toContainText('5,000 pts');
});
