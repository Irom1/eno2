import { describe, expect, it } from 'vitest';
import { cardsMode } from './cardsMode';

describe('cardsMode', () => {
  it('defaults to v2 when unset', () => {
    expect(cardsMode({})).toBe('v2');
    expect(cardsMode(undefined)).toBe('v2');
  });

  it('recognizes only off explicitly', () => {
    expect(cardsMode({ CARDS_MODE: 'off' })).toBe('off');
    expect(cardsMode({ CARDS_MODE: 'v2' })).toBe('v2');
  });
});
