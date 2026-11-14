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
    await route.fulfill({ json: { message: choice === 'none' ? 'A fresh dashboard it is. Take a look at your details.' : turns.length === 1 ? 'Nice to meet you, Ada. Want checking, savings, both, or no accounts yet?' : 'Checking is for everyday spending; savings is for setting money aside. You can choose either, both, or neither.', answers, spending: skipSpending, includeCreditCard: false, accountChoice: choice, stage: choice === 'none' ? 'review' : 'accounts', addressCheck: { status: 'matched', message: 'Street address matched.' }, ready: choice === 'none', confirmed: body.message === 'Looks good' } });
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
  expect(signupBody).toEqual({ first_name: 'Ada', last_name: 'Lovelace', address: { street_number: '123', street_name: 'Main St', city: 'Boston', state: 'MA', zip: '02139' }, accountChoice: 'none', spending: skipSpending, includeCreditCard: false });
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
    return route.fulfill(calls === 1 ? { status: 502, json: { error: 'I lost my train of thought.' } } : { json: { message: 'Nice to meet you, Ada. What’s your last name?', answers: { ...answers, last_name: '', street_number: '', street_name: '', city: '', state: '', zip: '' }, spending: skipSpending, includeCreditCard: false, accountChoice: 'undecided', ready: false, confirmed: false } });
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
    return route.fulfill({ json: { message: 'Got it. Would you like checking, savings, both, or neither?', answers: { ...answers, ...address }, spending: skipSpending, includeCreditCard: false, accountChoice: 'undecided', ready: false, confirmed: false, addressCheck: { status: 'matched', message: 'Street address matched.', address } } });
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
  await page.route('**/api/signup/chat', (route) => route.fulfill({ json: { message: 'I found a close match. Is this your address?', answers, spending: skipSpending, includeCreditCard: false, accountChoice: 'both', ready: false, confirmed: false, addressCheck: { status: 'correction', message: 'Check your address', candidates: [candidate] } } }));
  await page.route('**/api/signup', (route) => { created = true; return route.fulfill({ status: 500 }); });
  await page.goto('/signup');
  await say(page, 'My address is 123 Main St, Boston MA 02139. Both accounts please.');
  await expect(page.getByRole('button', { name: candidate.label })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Looks good. Let’s go' })).toHaveCount(0);
  expect(created).toBe(false);
});

for (const selection of [
  { name: 'all three accounts', checking: true, savings: true, creditCard: true, approval: 'yes lets do it', checkboxApproval: 'yes' },
  { name: 'checking only', checking: true, savings: false, creditCard: false, approval: 'everything looks good to me', checkboxApproval: 'good' },
  { name: 'no accounts', checking: false, savings: false, creditCard: false, approval: 'yes', checkboxApproval: null }
]) {
  test(`spending checklist precedes prechecked accounts, honors ${selection.name}, and accepts a natural yes`, async ({ page }) => {
    const preferences = { status: 'personalize', categories: ['dining', 'groceries'] };
    const card = { id: 'savor', name: 'Savor', nickname: 'Savor · Eno demo', reason: 'Dining comes first for you.', url: 'https://www.capitalone.com/credit-cards/savor/' };
    const turns: Record<string, unknown>[] = [];
    let created: Record<string, unknown> | undefined;
    await page.route('**/api/signup/chat', (route) => {
      const body = route.request().postDataJSON(); turns.push(body);
      const base = { answers, confirmed: false, addressCheck: { status: 'matched', message: 'Street address matched.' } };
      if (body.selectedAccounts) {
        const chosen = body.selectedAccounts;
        return route.fulfill({ json: { ...base, message: 'Your choices are ready. Take a glance at your profile.', accountChoice: chosen.checking && chosen.savings ? 'both' : chosen.checking ? 'checking' : chosen.savings ? 'savings' : 'none', includeCreditCard: chosen.creditCard, spending: preferences, stage: 'review', card: chosen.creditCard ? card : null, recommendedCard: card, ready: true } });
      }
      if (body.selectedSpending) return route.fulfill({ json: { ...base, message: 'Savor is your match. Keep the accounts you want.', accountChoice: 'undecided', includeCreditCard: null, spending: preferences, stage: 'accounts', card, recommendedCard: card, ready: false } });
      return route.fulfill({ json: { ...base, message: 'What spending matters most to you?', accountChoice: 'undecided', includeCreditCard: null, spending: { status: 'undecided', categories: [] }, stage: 'spending', card: null, recommendedCard: null, ready: false } });
    });
    await page.route('**/api/signup', (route) => { created = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { customerId: customer.id, created: true } }); });
    await page.route('**/api/customers*', (route) => route.fulfill({ json: { customers: [customer] } }));
    await page.route('**/api/session', (route) => route.fulfill({ json: { customer, accounts: [] } }));
    await page.route('**/api/accounts', (route) => route.fulfill({ json: { customer, accounts: [], bills: [], loans: [], recentActivity: [] } }));
    await page.route('**/api/overview', (route) => route.fulfill({ json: { overview: { totalRewards: 0 } } }));
    await page.goto('/signup');
    await say(page, 'I’m Ada Lovelace at 123 Main St, Boston MA 02139.');
    const categories = page.getByRole('group', { name: 'Top spending categories' });
    await expect(categories).toBeVisible();
    await expect(page.getByRole('group', { name: 'Choose accounts' })).toHaveCount(0);
    await categories.getByRole('checkbox', { name: /^Dining/ }).check();
    await categories.getByRole('checkbox', { name: /^Groceries/ }).check();
    if (selection.checkboxApproval) await say(page, selection.checkboxApproval);
    else await page.getByRole('button', { name: 'Confirm spending categories' }).click();
    const accounts = page.getByRole('group', { name: 'Choose accounts' });
    await expect(accounts).toBeVisible();
    for (const checkbox of await accounts.getByRole('checkbox').all()) await expect(checkbox).toBeChecked();
    await expect(page.getByRole('link', { name: 'About Capital One Savor' })).toHaveAttribute('href', card.url);
    expect(turns[1].selectedSpending).toEqual(['dining', 'groceries']);
    await accounts.getByRole('checkbox', { name: /^Checking account/ }).setChecked(selection.checking);
    await accounts.getByRole('checkbox', { name: /^Savings account/ }).setChecked(selection.savings);
    await accounts.getByRole('checkbox', { name: /^Capital One Savor credit card/ }).setChecked(selection.creditCard);
    if (selection.checkboxApproval) await say(page, selection.checkboxApproval);
    else await page.getByRole('button', { name: 'Confirm selected accounts' }).click();
    await expect(page.getByLabel('Your profile')).toBeVisible();
    expect(created).toBeUndefined();
    await say(page, selection.approval);
    await expect(page).toHaveURL(/dashboard\?customer=new-ada$/);
    expect(turns).toHaveLength(3);
    expect(created).toMatchObject({ includeCreditCard: selection.creditCard, accountChoice: selection.checking ? selection.savings ? 'both' : 'checking' : 'none' });
    expect(turns[2].selectedAccounts).toEqual({ checking: selection.checking, savings: selection.savings, creditCard: selection.creditCard });
  });
}

test('yes accepts the displayed mailing-address correction and moves to spending categories', async ({ page }) => {
  const corrected = { street_number: '123', street_name: 'Main St', city: 'Cambridge', state: 'MA', zip: '02139' };
  let turn = 0;
  await page.route('**/api/signup/chat', (route) => {
    const body = route.request().postDataJSON(); turn++;
    if (turn === 1) return route.fulfill({ json: { message: 'I found a close match. Is this the right mailing address?', answers, accountChoice: 'undecided', includeCreditCard: null, spending: { status: 'undecided', categories: [] }, stage: 'details', ready: false, confirmed: false, addressCheck: { status: 'correction', message: 'Check your address.', candidates: [{ id: 'corrected', label: '123 Main St, Cambridge, MA 02139', address: corrected }] } } });
    expect(body.message).toBe('yes'); expect(body.pendingAddress).toEqual(corrected);
    return route.fulfill({ json: { message: 'Got it — I’ll use that address. What spending matters most?', answers: { ...answers, ...corrected }, accountChoice: 'undecided', includeCreditCard: null, spending: { status: 'undecided', categories: [] }, stage: 'spending', ready: false, confirmed: false, addressCheck: { status: 'matched', message: 'Street address matched.', address: corrected } } });
  });
  await page.goto('/signup');
  await say(page, 'Ada Lovelace, at 123 Main St, Boston MA 02139');
  await expect(page.getByText('Is this the right mailing address?', { exact: false })).toBeVisible();
  await say(page, 'yes');
  await expect(page.getByRole('group', { name: 'Top spending categories' })).toBeVisible();
  expect(turn).toBe(2);
});

test('address corrections hide stale checklists and block later steps until the previous answer is accepted', async ({ page }) => {
  let created = 0;
  let turn = 0;
  const preferences = { status: 'personalize', categories: ['dining'] };
  await page.route('**/api/signup', (route) => { created++; return route.fulfill({ status: 500 }); });
  await page.route('**/api/signup/chat', (route) => {
    turn++;
    const base = { answers, accountChoice: 'undecided', spending: { status: 'undecided', categories: [] }, includeCreditCard: null, ready: false, confirmed: false };
    if (turn === 1) return route.fulfill({ json: { ...base, message: 'Please correct your mailing address.', stage: 'accounts', ready: true, confirmed: true, addressCheck: { status: 'not_found', message: 'Address not found.' } } });
    if (turn === 2) return route.fulfill({ json: { ...base, message: 'Is this the right mailing address?', stage: 'spending', addressCheck: { status: 'matched', message: 'Matched.', address: { street_number: '123', street_name: 'Main St', city: 'Boston', state: 'MA', zip: '02139' } } } });
    if (turn === 3) return route.fulfill({ json: { ...base, message: 'What spending matters most to you?', stage: 'spending', addressCheck: { status: 'matched', message: 'Matched.' } } });
    if (turn === 4) return route.fulfill({ json: { ...base, spending: preferences, message: 'Which accounts would you like?', stage: 'accounts', addressCheck: { status: 'matched', message: 'Matched.' } } });
    return route.fulfill({ json: { ...base, spending: preferences, message: 'Let’s fix the mailing address first.', stage: 'accounts', addressCheck: { status: 'correction', message: 'Please check the street.' } } });
  });
  await page.goto('/signup');
  await say(page, 'My address is incomplete');
  await expect(page.getByText('Please correct your mailing address.')).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByLabel('Your profile')).toHaveCount(0);
  expect(created).toBe(0);
  await say(page, '123 Main St, Boston MA 02139');
  await expect(page.getByText('Is this the right mailing address?')).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await say(page, 'yes');
  const categories = page.getByRole('group', { name: 'Top spending categories' });
  await expect(categories).toBeVisible();
  await categories.getByRole('checkbox', { name: /^Dining/ }).check();
  await say(page, 'yes');
  await expect(page.getByRole('group', { name: 'Choose accounts' })).toBeVisible();
  await say(page, 'Actually that street is wrong');
  await expect(page.getByText('Let’s fix the mailing address first.')).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  expect(created).toBe(0);
});
