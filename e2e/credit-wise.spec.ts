import { expect, test } from '@playwright/test';
import { creditScoreRating, demoCreditScore } from '../src/lib/creditWise';

test('CreditWise updates score, label, ring color and fill per profile and survives reload', async ({ page }) => {
  const labels = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  const customers = labels.map((label) => {
    let index = 0;
    while (creditScoreRating(demoCreditScore(`score-${index}`)).label !== label) index++;
    return { id: `score-${index}`, firstName: 'Score', lastName: label };
  });
  let active = customers[0];
  await page.route('**/api/customers', (route) => route.fulfill({ json: { customers } }));
  await page.route('**/api/session', (route) => {
    if (route.request().method() === 'POST') active = customers.find((customer) => customer.id === route.request().postDataJSON().customerId)!;
    return route.fulfill({ json: { customer: active, accounts: [] } });
  });
  await page.route('**/api/accounts', (route) => route.fulfill({ json: {
    customer: active,
    accounts: [{ id: 'checking', type: 'Checking', nickname: 'Checking', balance: 500, rewards: 0, accountNumber: '1234', customerId: active.id }],
    bills: [], loans: [], recentActivity: []
  } }));
  await page.route('**/api/overview', (route) => route.fulfill({ json: { overview: { totalRewards: 0 } } }));
  await page.goto(`/dashboard?customer=${active.id}`);
  const colors: string[] = [];
  const fills: number[] = [];
  for (const customer of customers) {
    if (customer !== customers[0]) {
      await page.locator('.profile').click();
      await page.getByRole('menuitemradio', { name: new RegExp(`Score ${customer.lastName}$`) }).click();
    }
    const score = demoCreditScore(customer.id);
    const rating = creditScoreRating(score);
    const gauge = page.getByRole('img', { name: `Demo credit score: ${score} out of 850, ${rating.label}`, exact: true });
    await expect(gauge).toBeVisible();
    await expect(gauge.locator('strong')).toHaveText(String(score));
    await expect(gauge.locator('small')).toHaveText(rating.label);
    const styles = await gauge.evaluate((element) => ({ color: getComputedStyle(element).getPropertyValue('--score-color').trim(), fill: parseFloat(getComputedStyle(element).getPropertyValue('--score-progress')), background: getComputedStyle(element).backgroundImage }));
    expect(styles.color).toBe(rating.color);
    expect(styles.background).toContain('conic-gradient');
    colors.push(styles.color); fills.push(styles.fill);
  }
  expect(new Set(colors).size).toBe(5);
  expect(fills).toEqual([...fills].sort((a, b) => a - b));
  const last = customers.at(-1)!;
  // Switcher selection lives in the session; clear the original URL override.
  await page.goto('/dashboard');
  await expect(page.locator('.gauge strong')).toHaveText(String(demoCreditScore(last.id)));
  await page.reload();
  await expect(page.locator('.gauge strong')).toHaveText(String(demoCreditScore(last.id)));
  await page.locator('.theme-toggle').click();
  await expect(page.locator('.gauge')).toHaveAttribute('style', /--score-color: #27926a/);
});
