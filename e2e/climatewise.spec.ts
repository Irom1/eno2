import { expect, test } from '@playwright/test';
import { collectErrors, expectNoErrors } from './helpers';

const report = {
	asOf: '2026-11-14',
	days: 90,
	totalKg: 1284,
	totalSpend: 4820,
	purchaseCount: 64,
	kgPerDollar: 0.27,
	annualizedTonnes: 5.2,
	benchmarkTonnes: 16,
	targetTonnes: 2.5,
	score: 712,
	tier: 'Good',
	categories: [
		{ id: 'transport', label: 'Travel & transport', color: '#c4562e', kg: 412, spend: 920, count: 12, share: 0.32, greenness: 0.38 },
		{ id: 'shopping', label: 'Shopping & services', color: '#7a5cc7', kg: 268, spend: 1100, count: 18, share: 0.21, greenness: 0.42 },
		{ id: 'energy', label: 'Home energy', color: '#e3a21a', kg: 234, spend: 640, count: 4, share: 0.18, greenness: 0.51 },
		{ id: 'food', label: 'Food & dining', color: '#2f8f5b', kg: 290, spend: 1860, count: 26, share: 0.23, greenness: 0.46 },
		{ id: 'housing', label: 'Housing', color: '#2a6fb5', kg: 80, spend: 300, count: 4, share: 0.06, greenness: 0.5 }
	],
	greenness: {
		ratings: [],
		greenShare: 0.42,
		flexibleSpend: 3200,
		fixedSpend: 1620
	},
	topPurchases: Array.from({ length: 8 }, (_, index) => ({
		id: `purchase-${index}`,
		kind: 'purchase',
		amount: 40 + index * 12,
		description: index % 2 ? 'WHOLE FOODS MKT' : 'SHELL OIL',
		date: `2026-11-0${(index % 9) + 1}`,
		category: index % 2 ? 'food' : 'transport',
		rating: index % 2 ? 'green' : 'heavy',
		sub: 'groceries',
		kg: 12 + index
	})),
	nudges: [],
	equivalents: { milesDriven: 3120, treeSeedlings: 41 }
};

test.describe('ClimateWise adaptive card', () => {
	test('switches layout, ring size, and rows as the stage resizes', async ({ page }) => {
		const errors = collectErrors(page);
		const customer = { id: 'climate-demo', firstName: 'Climate', lastName: 'Demo' };
		await page.route('**/api/session', (route) => route.fulfill({ json: { customer, accounts: [{ id: 'checking' }] } }));
		await page.route('**/api/climate**', (route) => route.fulfill({ json: { customer, report } }));

		await page.goto('/climatewise');

		const card = page.locator('article.card');
		await expect(card).toBeVisible({ timeout: 20_000 });
		await expect(card).toHaveAttribute('data-mode', 'medium');
		await expect(card).toHaveAttribute('data-layout', 'portrait');
		await expect(card).toHaveAttribute('data-density', 'tall');
		await expect(page.locator('.ring svg')).toBeVisible();

		const initialRing = await page.locator('.ring').evaluate((el) => el.getBoundingClientRect().width);

		const handle = page.getByRole('separator', { name: 'Resize ClimateWise preview' });
		const box = await handle.boundingBox();
		expect(box).not.toBeNull();
		if (!box) return;

		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2 + 460, box.y + box.height / 2 - 260, { steps: 12 });
		await page.mouse.up();

		await expect(page.locator('.dims')).toHaveText('900 × 500');
		await expect(card).toHaveAttribute('data-mode', 'wide');
		await expect(card).toHaveAttribute('data-layout', 'wide');
		await expect(card).toHaveAttribute('data-density', 'short');

		const wideRing = await page.locator('.ring').evaluate((el) => el.getBoundingClientRect().width);
		expect(wideRing).toBeLessThan(initialRing);
		expect(wideRing).toBeGreaterThanOrEqual(150);
		expect(wideRing).toBeLessThanOrEqual(260);

		const overflow = await card.evaluate((el) => ({
			scrollWidth: el.scrollWidth,
			clientWidth: el.clientWidth,
			scrollHeight: el.scrollHeight,
			clientHeight: el.clientHeight
		}));
		expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
		expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight + 1);

		await expect(page.locator('.toolbar')).toContainText('wide');
		await expect(page.locator('.toolbar')).toContainText('short');

		expectNoErrors(errors);
	});
});
