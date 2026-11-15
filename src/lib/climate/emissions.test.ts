import { describe, expect, it } from 'vitest';
import { mergeTransactions } from '../server/accounts';
import { buildDemoTransactions, demoAccountTotals } from '../server/nessie/seedTransactions';
import { buildReport, CATEGORIES, classify, fromNessiePurchase, scoreForPerformance, tierFor } from './emissions';

// Raw Nessie deposits/withdrawals, run through the same normalizer /api/accounts/:id uses,
// so these tests break if that endpoint's transaction shape ever drifts from what ClimateWise reads.
const withdrawals = [
  { _id: 'w1', amount: 64.2, description: 'WHOLE FOODS MKT', transaction_date: '2026-11-10', status: 'executed' },
  { _id: 'w2', amount: 120, description: 'EVERSOURCE ENERGY', transaction_date: '2026-11-05', status: 'executed' },
  { _id: 'w3', amount: 45, description: 'SHELL OIL', transaction_date: '2026-11-03', status: 'executed' },
  { _id: 'w4', amount: 500, description: 'TRANSFER TO SAVINGS', transaction_date: '2026-11-02', status: 'executed' },
  { _id: 'w5', amount: 300, description: 'CARD PAYMENT THANK YOU', transaction_date: '2026-11-01', status: 'executed' },
  { _id: 'w6', amount: 80, description: 'AMAZON MKTPLACE', transaction_date: '2026-06-01', status: 'executed' }
];
const deposits = [
  { _id: 'd1', amount: 2400, description: 'ACME CORP PAYROLL', transaction_date: '2026-11-01', status: 'executed' }
];
const asOf = new Date('2026-11-14T12:00:00Z');
const transactions = mergeTransactions(deposits, withdrawals, 1000);

describe('ClimateWise report', () => {
  it('avoids the score floor when all three generated accounts have a suspicious gas purchase', () => {
    for (const category of ['dining', 'groceries', 'entertainment', 'travel', 'shopping', 'gas', 'bills', 'other'] as const) {
      for (let profile = 0; profile < 10; profile++) {
        const activity = (['Checking', 'Savings', 'Credit Card'] as const).flatMap((type) => {
          let attempt = 0;
          let history;
          do {
            history = buildDemoTransactions(type, `climate-${category}-${profile}-${type}-${attempt++}`, asOf, [category]);
          } while (!history.some((item) => item.description === 'SHELL GAS STATION' && item.amount > 100) && attempt < 100);
          expect(history.some((item) => item.description === 'SHELL GAS STATION' && item.amount > 100)).toBe(true);
          const raw = history.map((item, index) => ({ ...item, _id: `${type}-${index}` }));
          return mergeTransactions(raw.filter((item) => item.kind === 'deposit'), raw.filter((item) => item.kind === 'withdrawal'), demoAccountTotals(history, type).balance, type === 'Credit Card');
        });
        const report = buildReport(activity, { days: 90, asOf });
        const withoutGasOutliers = buildReport(activity.filter((item) => !(item.description === 'SHELL GAS STATION' && item.amount > 100)), { days: 90, asOf });
        expect(report.score, `${category} profile ${profile}: ${report.totalKg} kg, score without gas outliers ${withoutGasOutliers.score}`).toBeGreaterThan(300);
        expect(withoutGasOutliers.score - report.score).toBeLessThanOrEqual(140);
      }
    }
  });
  it('counts only purchases inside the window', () => {
    const report = buildReport(transactions, { days: 30, asOf });
    // payroll deposit, transfer, card payment and the June purchase are all excluded
    expect(report.purchaseCount).toBe(3);
    expect(report.totalSpend).toBeCloseTo(229.2, 1);
    expect(report.totalKg).toBeGreaterThan(0);
  });

  it('includes older purchases when the window widens', () => {
    const report = buildReport(transactions, { days: 365, asOf });
    expect(report.purchaseCount).toBe(4);
  });

  it('keeps the score between 300 and 850 and maps weighted performance linearly', () => {
    const report = buildReport(transactions, { days: 30, asOf });
    expect(report.score).toBeGreaterThanOrEqual(300);
    expect(report.score).toBeLessThanOrEqual(850);
    expect(scoreForPerformance(0)).toBe(300);
    expect(scoreForPerformance(0.3)).toBe(465);
    expect(scoreForPerformance(0.5)).toBe(575);
    expect(scoreForPerformance(1)).toBe(850);
  });

  it('uses FICO-style tiers', () => {
    expect(tierFor(850)).toBe('Exceptional');
    expect(tierFor(740)).toBe('Very good');
    expect(tierFor(670)).toBe('Good');
    expect(tierFor(580)).toBe('Fair');
    expect(tierFor(300)).toBe('Poor');
  });

  it('returns an empty, valid report with a neutral score and no purchases', () => {
    const report = buildReport([], { days: 30, asOf });
    expect(report.purchaseCount).toBe(0);
    expect(report.totalKg).toBe(0);
    expect(Number.isFinite(report.score)).toBe(true);
    expect(report.score).toBe(670);
  });

  it('scores a perfect high-weight category above the floor on its own', () => {
    const report = buildReport(
      [{ id: 'grocery', kind: 'purchase', amount: 64.2, description: 'WHOLE FOODS MKT', date: '2026-11-10' }],
      { days: 30, asOf }
    );
    const food = report.categories.find((c) => c.id === 'food')!;
    expect(food.greenness).toBe(1);
    expect(food.weight).toBeCloseTo(0.3, 6);
    expect(report.score).toBe(465);
    expect(report.score).not.toBe(300);
  });

  it('classifies every merchant the demo seed generates', () => {
    const categories = ['dining', 'groceries', 'entertainment', 'travel', 'shopping', 'gas', 'bills', 'other'] as const;
    const seeded = (['Checking', 'Savings', 'Credit Card'] as const).flatMap((type) =>
      Array.from({ length: 100 }, (_, index) => buildDemoTransactions(type, `acct-${type}-${index}`, asOf, categories)).flat()
    );
    const merchants = new Set(seeded.filter((t) => t.kind === 'withdrawal').map((t) => t.description));
    const counts = (description: string) =>
      buildReport([{ id: 'x', kind: 'withdrawal', amount: 10, description, date: '2026-11-10' }], { days: 30, asOf }).purchaseCount;
    for (const m of merchants) {
      // either excluded as a non-purchase, or matched by a real rule
      if (/TRANSFER|SAVINGS GOAL|DEMO OPENING/.test(m)) expect(counts(m), m).toBe(0);
      else expect(classify(m).sub, m).not.toBe('Other purchases');
    }
  });

  it('counts flights as carbon-heavy travel', () => {
    expect(classify('DELTA AIR LINES')).toMatchObject({ category: 'transport', rating: 'heavy', sub: 'Flights' });
    expect(classify('MARRIOTT HOTEL').sub).toBe('Hotels');
  });

  it('gives the ring slice sizes (score weights) that add up to the whole ring', () => {
    expect(CATEGORIES.reduce((s, c) => s + c.typicalShare, 0)).toBeCloseTo(1, 6);
    expect(CATEGORIES.find((c) => c.id === 'food')!.typicalShare).toBeCloseTo(0.3, 6);
  });

  it('maps raw Nessie purchases', () => {
    const tx = fromNessiePurchase({ _id: 'p1', amount: 12, purchase_date: '2026-11-12', merchant_name: 'BLUE BOTTLE COFFEE' });
    expect(tx).toMatchObject({ id: 'p1', kind: 'purchase', amount: 12, date: '2026-11-12' });
  });
});
