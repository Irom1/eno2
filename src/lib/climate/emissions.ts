/**
 * ClimateWise — spend-based carbon estimates for card / checking purchases.
 *
 * Method: emissions (kg CO2e) = purchase amount (USD) × category factor (kg CO2e per USD).
 * This is the "spend-based" method used for Scope 3 accounting.
 *
 * Factor sources
 *  - Most categories: approximations of US EPA "Supply Chain GHG Emission Factors v1.3"
 *    (USEEIO, kg CO2e per 2022 USD, purchaser price, with margins).
 *    https://catalog.data.gov/dataset/supply-chain-greenhouse-gas-emission-factors-v1-3-by-naics-6
 *    TODO(before judging): replace the `factor` values below with exact NAICS rows from the CSV.
 *  - Fuel: EPA tailpipe figure of 8,887 g CO2 per gallon of gasoline ÷ ~$3.10/gal (MA retail)
 *    https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle
 *  - Home energy: EPA's supply-chain set excludes electricity, so this uses a New England
 *    grid estimate (~0.25 kg CO2/kWh ÷ ~$0.30/kWh).
 *  - Benchmark: ~16 t CO2e per American per year (all sources, not just purchases).
 */

export type CategoryId = 'transport' | 'shopping' | 'energy' | 'food' | 'housing';

export interface Category {
	id: CategoryId;
	label: string;
	/** kg CO2e per USD */
	factor: number;
	/** Categorical colors (light / dark surface) — validated as a colorblind-safe set in this fixed order. Don't reorder. */
	color: string;
	colorDark: string;
	/** Rough share of this category's emissions a typical swap can avoid (for nudges). */
	reducible: number;
	tip: string;
}

/** Fixed order = ring order = color order (validated for light + dark). Don't reorder. */
export const CATEGORIES: Category[] = [
	{ id: 'transport', label: 'Fuel & rides', factor: 2.87, color: '#c4562e', colorDark: '#c95436', reducible: 0.3,
	  tip: 'Swap two drives a week for the T or a bike' },
	{ id: 'shopping', label: 'Shopping & services', factor: 0.2, color: '#7a5cc7', colorDark: '#8569d4', reducible: 0.3,
	  tip: 'Choose refurbished for your next electronics buy' },
	{ id: 'energy', label: 'Home energy', factor: 0.85, color: '#e3a21a', colorDark: '#c98500', reducible: 0.15,
	  tip: 'Enroll in a green-power plan with your utility' },
	{ id: 'food', label: 'Food & dining', factor: 0.55, color: '#2f8f5b', colorDark: '#2f9a62', reducible: 0.2,
	  tip: 'Make two dinners a week plant-based' },
	{ id: 'housing', label: 'Housing', factor: 0.1, color: '#2a6fb5', colorDark: '#3478c2', reducible: 0.05,
	  tip: 'Ask your landlord about efficiency upgrades' }
];

/** How sustainable a purchase is compared with the alternatives for the same need. */
export type Rating = 'green' | 'mixed' | 'heavy' | 'fixed';

export const RATINGS: { id: Exclude<Rating, 'fixed'>; label: string; blurb: string; color: string; colorDark: string }[] = [
	{ id: 'green', label: 'Green choices', blurb: 'Low-carbon ways to meet the need', color: '#2f8f5b', colorDark: '#2f9a62' },
	{ id: 'mixed', label: 'In between', blurb: 'Fine, with greener swaps available', color: '#e3a21a', colorDark: '#c98500' },
	{ id: 'heavy', label: 'Carbon-heavy', blurb: 'A greener option exists', color: '#9c3f4f', colorDark: '#a95a8c' }
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
	CategoryId,
	Category
>;

/**
 * Rule-based merchant → category, sustainability rating, sub-label and emission factor (kg CO2e per $).
 * Factors live on the rule so merged categories keep accurate rates (eating out ≠ groceries). First match wins.
 */
const RULES: [RegExp, CategoryId, Rating, string, number][] = [
	[/\b(SHELL|EXXON|MOBIL|CHEVRON|SUNOCO|BP|CITGO|GULF|MARATHON|SPEEDWAY|GAS|FUEL|OIL)\b/i, 'transport', 'heavy', 'Gas', 2.87],
	[/\b(UBER|LYFT|TAXI|CAB)\b/i, 'transport', 'mixed', 'Rideshare', 0.45],
	[/\b(MBTA|SUBWAY|TRANSIT|AMTRAK|METRO|BUS|BLUEBIKES|BIKE)\b/i, 'transport', 'green', 'Public transit & bikes', 0.2],
	[/\b(EVERSOURCE|NATIONAL GRID|ENERGY|ELECTRIC|UTILIT|POWER)\b/i, 'energy', 'mixed', 'Utilities', 0.85],
	[/\b(WHOLE FOODS|SAFEWAY|TRADER JOE'?S?|KROGER|STOP ?& ?SHOP|MARKET BASKET|GROCER|MKT|ALDI|COSTCO|FARMERS)\b/i, 'food', 'green', 'Groceries', 0.55],
	[/\b(DOORDASH|GRUBHUB|UBER ?EATS|POSTMATES|INSTACART)\b/i, 'food', 'heavy', 'Delivery', 0.3],
	[/\b(COFFEE|CAFE|STARBUCKS|DUNKIN)\b/i, 'food', 'mixed', 'Coffee shops', 0.3],
	[/\b(CHIPOTLE|BISTRO|RESTAURANT|PIZZA|BURGER|GRILL|KITCHEN)\b/i, 'food', 'mixed', 'Eating out', 0.3],
	[/\b(RENT|PROPERTIES|APARTMENT|MORTGAGE|LEASING)\b/i, 'housing', 'fixed', 'Rent', 0.1],
	[/\b(APPLE STORE|BEST ?BUY|ELECTRONICS|MICRO ?CENTER)\b/i, 'shopping', 'heavy', 'New electronics', 0.2],
	[/\b(THRIFT|GOODWILL|REFURB|BACK ?MARKET)\b/i, 'shopping', 'green', 'Secondhand', 0.1],
	[/\b(AMAZON|MKTPLACE|TEMU|SHEIN)\b/i, 'shopping', 'mixed', 'Online orders', 0.25],
	[/\b(TARGET|WALMART|IKEA|STORE|SHOP)\b/i, 'shopping', 'mixed', 'Retail', 0.2],
	[/\b(NETFLIX|SPOTIFY|HULU|DISNEY)\b/i, 'shopping', 'green', 'Streaming', 0.08],
	[/\b(COMCAST|VERIZON|AT&T|T-MOBILE)\b/i, 'shopping', 'green', 'Phone & internet', 0.1],
	[/\b(FITNESS|EQUINOX|GYM)\b/i, 'shopping', 'green', 'Gym', 0.15],
	[/\b(GEICO|INSURANCE)\b/i, 'shopping', 'green', 'Insurance', 0.05]
];

/** Weight of each rating when scoring how green a set of purchases is. */
export const RATING_WEIGHT: Record<Rating, number> = { green: 1, mixed: 0.5, heavy: 0.15, fixed: 0.5 };

/** Not purchases: money moving between your own accounts, card payments, payroll, refunds. */
const NON_PURCHASE = /\b(TRANSFER|PAYMENT THANK YOU|PAYROLL|REFUND|DEPOSIT|INTEREST)\b/i;

export function classify(description: string): { category: CategoryId; rating: Rating; sub: string; factor: number } {
	for (const [re, category, rating, sub, factor] of RULES) if (re.test(description)) return { category, rating, sub, factor };
	return { category: 'shopping', rating: 'mixed', sub: 'Other purchases', factor: CATEGORY_BY_ID.shopping.factor };
}

export const categorize = (description: string): CategoryId => classify(description).category;

/** Shape of a row from the app's /api/accounts/:id `transactions` array. */
export interface AppTransaction {
	id: string;
	kind: string; // 'withdrawal' | 'deposit' | 'purchase' ...
	amount: number;
	description: string;
	date: string; // YYYY-MM-DD
}

/** Adapter for a raw Nessie purchase (GET /accounts/{id}/purchases). */
export function fromNessiePurchase(p: {
	_id: string;
	amount: number;
	description?: string;
	purchase_date: string;
	merchant_name?: string;
}): AppTransaction {
	return {
		id: p._id,
		kind: 'purchase',
		amount: p.amount,
		description: p.merchant_name ?? p.description ?? 'PURCHASE',
		date: p.purchase_date
	};
}

export interface ScoredPurchase extends AppTransaction {
	category: CategoryId;
	rating: Rating;
	sub: string;
	kg: number;
}

export interface RatingTotal {
	id: Exclude<Rating, 'fixed'>;
	label: string;
	blurb: string;
	color: string;
	colorDark: string;
	spend: number;
	kg: number;
	count: number;
	share: number; // 0..1 of flexible spend
	items: { sub: string; spend: number }[]; // biggest first
}

export interface CategoryTotal {
	id: CategoryId;
	label: string;
	color: string;
	kg: number;
	spend: number;
	count: number;
	share: number; // 0..1 of kg
	/** 0..1 — how green the choices in this category are (spend-weighted rating). */
	greenness: number;
}

export interface Nudge {
	category: CategoryId;
	title: string;
	body: string;
	savingKgPerMonth: number;
	prompt: string; // sent to Eno
}

export interface ClimateReport {
	asOf: string;
	days: number;
	totalKg: number;
	totalSpend: number;
	purchaseCount: number;
	kgPerDollar: number;
	annualizedTonnes: number;
	benchmarkTonnes: number;
	targetTonnes: number;
	score: number; // 0..100, higher is better
	tier: string;
	categories: CategoryTotal[]; // fixed CATEGORIES order, includes zeroes
	/** "How green" view: flexible spend split by rating. Fixed costs (rent) are left out. */
	greenness: { ratings: RatingTotal[]; greenShare: number; flexibleSpend: number; fixedSpend: number };
	topPurchases: ScoredPurchase[];
	nudges: Nudge[];
	equivalents: { milesDriven: number; treeSeedlings: number };
}

export const US_AVG_TONNES = 16; // per person per year, all sources
export const TARGET_TONNES = 2.5; // ~per-capita level for a 1.5°C pathway by 2030 (IPCC AR6)

export function tierFor(score: number): string {
	if (score >= 80) return 'Excellent';
	if (score >= 65) return 'Very good';
	if (score >= 50) return 'Good';
	if (score >= 35) return 'Fair';
	return 'Needs work';
}

/**
 * Score: 50 = on pace with the US average, 100 = zero purchase emissions.
 * Linear, clamped to 0..100.
 */
export function scoreFor(annualTonnes: number): number {
	return Math.round(Math.max(0, Math.min(100, 100 - (annualTonnes / US_AVG_TONNES) * 50)));
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function buildReport(
	transactions: AppTransaction[],
	opts: { days?: number; asOf?: Date } = {}
): ClimateReport {
	const days = opts.days ?? 90;
	const asOf = opts.asOf ?? new Date();
	const since = new Date(asOf);
	since.setDate(since.getDate() - days);
	const sinceIso = since.toISOString().slice(0, 10);

	const purchases: ScoredPurchase[] = transactions
		.filter((t) => (t.kind === 'withdrawal' || t.kind === 'purchase') && t.amount > 0)
		.filter((t) => !NON_PURCHASE.test(t.description))
		.filter((t) => t.date >= sinceIso)
		.map((t) => {
			const { factor, ...c } = classify(t.description);
			return { ...t, ...c, kg: t.amount * factor };
		});

	const totalKg = purchases.reduce((s, p) => s + p.kg, 0);
	const totalSpend = purchases.reduce((s, p) => s + p.amount, 0);

	const categories: CategoryTotal[] = CATEGORIES.map((c) => {
		const rows = purchases.filter((p) => p.category === c.id);
		const kg = rows.reduce((s, p) => s + p.kg, 0);
		return {
			id: c.id,
			label: c.label,
			color: c.color,
			kg: round(kg),
			spend: round(rows.reduce((s, p) => s + p.amount, 0), 2),
			count: rows.length,
			share: totalKg ? kg / totalKg : 0,
			greenness: (() => {
				const spend = rows.reduce((s, p) => s + p.amount, 0);
				return spend ? rows.reduce((s, p) => s + p.amount * RATING_WEIGHT[p.rating], 0) / spend : 0;
			})()
		};
	});

	const flexible = purchases.filter((p) => p.rating !== 'fixed');
	const flexibleSpend = flexible.reduce((s, p) => s + p.amount, 0);
	const ratings: RatingTotal[] = RATINGS.map((r) => {
		const rows = flexible.filter((p) => p.rating === r.id);
		const bySub = new Map<string, number>();
		for (const p of rows) bySub.set(p.sub, (bySub.get(p.sub) ?? 0) + p.amount);
		const spend = rows.reduce((s, p) => s + p.amount, 0);
		return {
			...r,
			spend: round(spend, 2),
			kg: round(rows.reduce((s, p) => s + p.kg, 0)),
			count: rows.length,
			share: flexibleSpend ? spend / flexibleSpend : 0,
			items: [...bySub].map(([sub, spend]) => ({ sub, spend: round(spend, 2) })).sort((a, b) => b.spend - a.spend)
		};
	});

	const annualizedTonnes = (totalKg / days) * 365 / 1000;
	const score = scoreFor(annualizedTonnes);
	const monthly = (kg: number) => (kg / days) * 30;

	const nudges: Nudge[] = categories
		.map((c) => ({ c, save: monthly(c.kg) * CATEGORY_BY_ID[c.id].reducible }))
		.filter((x) => x.save >= 5)
		.sort((a, b) => b.save - a.save)
		.slice(0, 3)
		.map(({ c, save }) => ({
			category: c.id,
			title: CATEGORY_BY_ID[c.id].tip,
			body: `${c.label}: ${Math.round(c.share * 100)}% of your purchase footprint.`,
			savingKgPerMonth: Math.round(save),
			prompt: `Help me cut my ${c.label.toLowerCase()} emissions by about ${Math.round(save)} kg a month.`
		}));

	return {
		asOf: asOf.toISOString().slice(0, 10),
		days,
		totalKg: round(totalKg),
		totalSpend: round(totalSpend, 2),
		purchaseCount: purchases.length,
		kgPerDollar: totalSpend ? round(totalKg / totalSpend, 2) : 0,
		annualizedTonnes: round(annualizedTonnes),
		benchmarkTonnes: US_AVG_TONNES,
		targetTonnes: TARGET_TONNES,
		score,
		tier: tierFor(score),
		categories,
		greenness: {
			ratings,
			greenShare: ratings[0].share,
			flexibleSpend: round(flexibleSpend, 2),
			fixedSpend: round(totalSpend - flexibleSpend, 2)
		},
		topPurchases: [...purchases].sort((a, b) => b.kg - a.kg).slice(0, 6).map((p) => ({ ...p, kg: round(p.kg) })),
		nudges,
		equivalents: {
			// EPA: ~404 g CO2 per mile for an average passenger car
			milesDriven: Math.round(totalKg / 0.404),
			// EPA equivalencies: one urban tree seedling grown for 10 years ≈ 60 kg CO2
			treeSeedlings: Math.round(totalKg / 60)
		}
	};
}
