import { describe, expect, it } from 'vitest';
import { accountWheelPosition } from './accountWheelGesture';

describe('account wheel scrolling', () => {
  it('keeps responding throughout sustained scrolling without locking', () => {
    let position = 0;
    for (let i = 0; i < 40; i++) {
      const next = accountWheelPosition(position, 10, 10);
      expect(next).toBeGreaterThan(position);
      position = next;
    }
    expect(position).toBeCloseTo(140);
  });

  it('responds immediately when direction reverses', () => {
    const position = accountWheelPosition(100, 20, 10);
    expect(accountWheelPosition(position, -20, 10)).toBe(100);
  });

  it('stops at either end without accumulating overscroll', () => {
    expect(accountWheelPosition(0, -500, 3)).toBe(0);
    expect(accountWheelPosition(152, 500, 3)).toBe(152);
    expect(accountWheelPosition(152, -20, 3)).toBe(145);
  });
});
