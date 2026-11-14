import { expect, test, type Page } from '@playwright/test';

const maya = { id: 'protected-maya', firstName: 'Maya', lastName: 'Chen' };
const demo = { id: 'protected-demo', firstName: 'Demo', lastName: 'Tester' };
const future = { id: 'future-person', firstName: 'Future', lastName: 'Person' };

async function mockCustomers(page: Page, initiallyActive = maya) {
  let removed = false;
  let active = initiallyActive;
  const methods: string[] = [];
  await page.route('**/api/customers', (route) => route.fulfill({ json: { customers: removed ? [maya, demo] : [maya, demo, future] } }));
  await page.route('**/api/customers/future-person', (route) => {
    const method = route.request().method(); methods.push(method); removed = method === 'DELETE';
    return route.fulfill({ json: { customerId: future.id, removed } });
  });
  await page.route('**/api/session', (route) => {
    if (route.request().method() === 'POST') active = [maya, demo, future].find((customer) => customer.id === route.request().postDataJSON().customerId) ?? maya;
    return route.fulfill({ json: { customer: active, accounts: [] } });
  });
  await page.route('**/api/accounts', (route) => route.fulfill({ json: { customer: active, accounts: [], bills: [], loans: [], recentActivity: [] } }));
  await page.route('**/api/overview', (route) => route.fulfill({ json: { overview: { totalRewards: 0 } } }));
  return methods;
}

test('sign-in rows delete future profiles without navigating and allow Undo after reload', async ({ page }) => {
  const methods = await mockCustomers(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Maya Chen', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete Demo Tester', exact: true })).toHaveCount(0);
  const remove = page.getByRole('button', { name: 'Delete Future Person', exact: true });
  const row = page.getByRole('link', { name: /Future Person/ });
  const [iconBox, rowBox] = await Promise.all([remove.boundingBox(), row.boundingBox()]);
  expect(iconBox!.x).toBeGreaterThan(rowBox!.x);
  await remove.click();
  await expect(page.getByRole('link', { name: /Future Person/ })).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: /Future Person/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('link', { name: /Future Person/ })).toBeVisible();
  expect(methods).toEqual(['DELETE', 'POST']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a failed removal keeps the profile and shows the server error', async ({ page }) => {
  await mockCustomers(page);
  await page.route('**/api/customers/future-person', (route) => route.fulfill({ status: 502, json: { error: 'Couldn’t confirm the change. Please try again.' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Future Person', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Couldn’t confirm the change.');
  await expect(page.getByRole('link', { name: /Future Person/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete Future Person', exact: true })).toBeEnabled();
});
