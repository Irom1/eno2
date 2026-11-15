import { describe, expect, it } from 'vitest';
import { chatViewportMetrics } from './mobileViewport';

describe('chatViewportMetrics', () => {
  it('treats matching layout and visual heights as no keyboard (desktop)', () => {
    expect(chatViewportMetrics(900, 900, 0)).toEqual({
      height: 900,
      offsetTop: 0,
      keyboardOpen: false
    });
  });

  it('reports an open keyboard when the visual viewport shrinks', () => {
    expect(chatViewportMetrics(800, 500, 0)).toEqual({
      height: 500,
      offsetTop: 0,
      keyboardOpen: true
    });
  });

  it('clamps negative offsets to zero and preserves positive ones', () => {
    expect(chatViewportMetrics(800, 500, -24).offsetTop).toBe(0);
    expect(chatViewportMetrics(800, 500, 48.4).offsetTop).toBe(48);
  });

  it('never reports a height below the 320px minimum', () => {
    expect(chatViewportMetrics(800, 120, 0)).toEqual({
      height: 320,
      offsetTop: 0,
      keyboardOpen: true
    });
  });

  it('falls back to the layout height when visual metrics are missing', () => {
    expect(chatViewportMetrics(720, 0, 0)).toEqual({
      height: 720,
      offsetTop: 0,
      keyboardOpen: false
    });
  });

  it('does not treat small height differences as a keyboard', () => {
    expect(chatViewportMetrics(800, 760, 0).keyboardOpen).toBe(false);
    expect(chatViewportMetrics(800, 700, 0).keyboardOpen).toBe(true);
  });
});
