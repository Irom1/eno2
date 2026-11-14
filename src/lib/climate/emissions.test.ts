import { describe, expect, it } from 'vitest';
import { mergeTransactions } from '../server/accounts';
import { buildReport, fromNessiePurchase, scoreFor, US_AVG_TONNES } from './emissions';

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

  it('keeps the score between 0 and 100 and pins the US average to 50', () => {
    const report = buildReport(transactions, { days: 30, asOf });
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(scoreFor(US_AVG_TONNES)).toBe(50);
    expect(scoreFor(0)).toBe(100);
    expect(scoreFor(1000)).toBe(0);
  });

  it('returns an empty, valid report with no transactions', () => {
    const report = buildReport([], { days: 30, asOf });
    expect(report.purchaseCount).toBe(0);
    expect(report.totalKg).toBe(0);
    expect(Number.isFinite(report.score)).toBe(true);
  });

  it('maps raw Nessie purchases', () => {
    const tx = fromNessiePurchase({ _id: 'p1', amount: 12, purchase_date: '2026-11-12', merchant_name: 'BLUE BOTTLE COFFEE' });
    expect(tx).toMatchObject({ id: 'p1', kind: 'purchase', amount: 12, date: '2026-11-12' });
  });
});
