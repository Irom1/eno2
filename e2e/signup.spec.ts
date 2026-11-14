import { expect, test, type Page } from '@playwright/test';

const answers = { first_name: 'Ada', last_name: 'Lovelace', street_number: '123', street_name: 'Main St', city: 'Boston', state: 'MA', zip: '02139' };
const customer = { id: 'new-ada', firstName: 'Ada', lastName: 'Lovelace', city: 'Boston', state: 'MA' };
async function say(page: Page, message: string) {
  await page.getByRole('textbox', { name: 'Message Eno' }).fill(message);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
}

test('starts immediately as a freeform chat, keeps details through questions, then opens an empty dashboard', async ({ page }) => {
  const turns: Record<string, unknown>[] = [];
  let signupBody: unknown;
  await page.route('**/api/signup/chat', async (route) => {
    const body = route.request().postDataJSON(); turns.push(body);
    const choice = /no accounts/i.test(body.message) || body.accountChoice === 'none' ? 'none' : 'undecided';
    await route.fulfill({ json: { message: choice === 'none' ? 'A fresh dashboard it is. Take a look at your details.' : turns.length === 1 ? 'Nice to meet you, Ada. Want checking, savings, both, or no accounts yet?' : 'Checking is for everyday spending; savings is for setting money aside. You can choose either, both, or neither.', answers, accountChoice: choice, ready: choice === 'none', confirmed: body.message === 'Looks good' } });
  });
  await page.route('**/api/signup', (route) => { signupBody = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { customerId: customer.id, created: true } }); });
  await page.route('**/api/customers*', (route) => route.fulfill({ json: { customers: route.request().url().includes('?customer=') ? [customer] : [{ id: 'maya', firstName: 'Maya', lastName: 'Chen' }] } }));
  await page.route('**/api/session', (route) => route.fulfill({ json: route.request().method() === 'GET' ? { customer } : { customer, accounts: [] } }));
  await page.route('**/api/accounts', (route) => route.fulfill({ json: { customer, accounts: [], bills: [], loans: [], recentActivity: [] } }));
  await page.route('**/api/overview', (route) => route.fulfill({ json: { overview: { totalRewards: 0 } } }));
  await page.goto('/signup');
  await expect(page.getByRole('textbox', { name: 'Message Eno' })).toBeFocused();
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
  expect(signupBody).toBeUndefined();
  await say(page, 'Looks good');
  await expect(page).toHaveURL(/dashboard\?customer=new-ada$/);
  expect(signupBody).toEqual({ first_name: 'Ada', last_name: 'Lovelace', address: { street_number: '123', street_name: 'Main St', city: 'Boston', state: 'MA', zip: '02139' }, accountChoice: 'none' });
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
    return route.fulfill(calls === 1 ? { status: 502, json: { error: 'I lost my train of thought.' } } : { json: { message: 'Nice to meet you, Ada. What’s your last name?', answers: { ...answers, last_name: '', street_number: '', street_name: '', city: '', state: '', zip: '' }, accountChoice: 'undecided', ready: false, confirmed: false } });
  });
  await page.goto('/signup');
  await say(page, 'Ada');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Nice to meet you, Ada.', { exact: false })).toBeVisible();
  await expect(page.locator('.from-you')).toHaveCount(1);
});

test('Eno stays beside the chat, can speak, and fits on mobile', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [], cancel: () => {},
      speak: (utterance: SpeechSynthesisUtterance) => { document.documentElement.setAttribute('data-spoken-text', utterance.text); utterance.dispatchEvent(new Event('start')); }
    } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/signup');
  await expect(page.getByRole('complementary', { name: 'Eno, your money sidekick' })).toBeVisible();
  await page.getByRole('button', { name: 'Enable Eno voice', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-spoken-text', /What should I call you/);
  await expect(page.getByRole('button', { name: 'Mute Eno voice', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox', { name: 'Message Eno' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
