import { expect, it } from 'vitest';
import { chargeIdentity, chargeReviewMessages } from './anomalyReview';
import { anomalyTransactionCards, type EntityCard } from './entityCards';

function finding(index: number, type = 'outlier', accountId = 'checking') {
  return { _id: `charge-${index}`, type, description: `MERCHANT ${index}`, amount: 300 + index, date: '2026-11-01', accountId, accountLabel: accountId === 'checking' ? '360 Checking' : 'Venture · Eno demo', median: 30, reason: "much larger than this merchant's usual purchases" };
}

it('puts a distinct reason immediately before each card and limits every message to eight', () => {
  const findings = [...Array.from({ length: 10 }, (_, i) => finding(i, 'duplicate')), ...Array.from({ length: 17 }, (_, i) => finding(i + 10))];
  const pages = chargeReviewMessages(anomalyTransactionCards({ findings }, 0, 1));
  expect(pages.map((page) => [page.category, page.inlineCards.length])).toEqual([['duplicate', 8], ['duplicate', 2], ['unusual', 8], ['unusual', 8], ['unusual', 1]]);
  const keys = pages.flatMap((page) => page.inlineCards.map(chargeIdentity));
  expect(new Set(keys).size).toBe(27);
  for (const page of pages) {
    let previous = 0;
    for (const card of page.inlineCards) {
      const explanation = page.text.slice(previous, card.afterText);
      expect(explanation).toContain((card as Extract<EntityCard, { kind: 'transaction' }>).payload.description);
      expect(explanation).toMatch(/because|compared with/);
      previous = card.afterText!;
    }
  }
});

it('removes repeat emissions and Demo activity, while preserving distinct accounts', () => {
  const cards = anomalyTransactionCards({ findings: [finding(1), finding(1), finding(1, 'outlier', 'venture'), { ...finding(2), description: 'DEMO OPENING PURCHASE' }] }, 0, 1);
  const pages = chargeReviewMessages([...cards, ...cards]);
  expect(pages.flatMap((page) => page.inlineCards)).toHaveLength(2);
  expect(pages[0].text).toContain('on your 360 Checking');
  expect(pages[0].text).toContain('on your Venture');
  expect(pages[0].text).not.toContain('Demo');
  expect(pages[0].text).toContain('typically $30');
});

it('keeps normal recurring charges in a separate message without calling them suspicious', () => {
  const recurring: EntityCard = { id: 99, entityId: 'subscription', kind: 'recurring', payload: { chargeId: 'subscription', description: 'MONTHLY INTERNET', averageAmount: 79, monthsSeen: 3, lastDate: '2026-11-01' } };
  const pages = chargeReviewMessages([...anomalyTransactionCards({ findings: [finding(1)] }, 0, 1), recurring]);
  expect(pages.map((page) => page.category)).toEqual(['recurring', 'unusual']);
  expect(pages[0].text).toContain('not suspicious by itself');
  expect(pages[0].inlineCards.every((card) => card.kind === 'recurring')).toBe(true);
});

it('reports a partial scan rather than silently presenting it as complete', () => {
  expect(chargeReviewMessages([], false)[0].text).toContain('incomplete');
});
