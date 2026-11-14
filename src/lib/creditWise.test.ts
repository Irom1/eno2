import { describe, expect, it } from 'vitest';
import { creditScoreRating, demoCreditScore } from './creditWise';

describe('demo CreditWise scores', () => {
  it('spans 300–850 and keeps a profile consistent across reloads', () => {
    const scores = Array.from({ length: 10000 }, (_, index) => demoCreditScore(`customer-${index}`));
    expect(Math.min(...scores)).toBe(300);
    expect(Math.max(...scores)).toBe(850);
    expect(new Set(scores).size).toBe(551);
    expect(demoCreditScore('customer-a')).toBe(demoCreditScore('customer-a'));
    expect(demoCreditScore('customer-a')).not.toBe(demoCreditScore('customer-b'));
  });
  it('changes the rating and ring color at each score band', () => {
    const bands = [[300, 579, 'Poor'], [580, 669, 'Fair'], [670, 739, 'Good'], [740, 799, 'Very good'], [800, 850, 'Excellent']] as const;
    for (const [min, max, label] of bands) {
      expect(creditScoreRating(min).label).toBe(label);
      expect(creditScoreRating(max).label).toBe(label);
      expect(creditScoreRating(min).color).toBe(creditScoreRating(max).color);
    }
    expect(new Set(bands.map(([min]) => creditScoreRating(min).color)).size).toBe(5);
  });
});
