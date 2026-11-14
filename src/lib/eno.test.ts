import { describe, expect, it } from 'vitest';
import {
  ENO_FRAMES,
  enoSrc,
  nextEnoFrame,
  type EnoPose,
  type EnoVariant
} from './eno';

describe('ENO_FRAMES', () => {
  it('cycles wave, open, reach in order', () => {
    expect(ENO_FRAMES.map((frame) => frame.pose)).toEqual(['wave', 'open', 'reach']);
  });

  it('keeps the middle frame shorter than both neighbours', () => {
    const [first, middle, last] = ENO_FRAMES;
    expect(middle.duration).toBeLessThan(first.duration);
    expect(middle.duration).toBeLessThan(last.duration);
  });
});

describe('nextEnoFrame', () => {
  it('advances and wraps back to the first frame', () => {
    expect(nextEnoFrame(0)).toBe(1);
    expect(nextEnoFrame(1)).toBe(2);
    expect(nextEnoFrame(2)).toBe(0);
  });
});

describe('enoSrc', () => {
  it('returns the six mascot asset paths', () => {
    const variants: EnoVariant[] = ['light', 'navy'];
    const poses: EnoPose[] = ['wave', 'open', 'reach'];
    const paths = variants.flatMap((variant) =>
      poses.map((pose) => enoSrc(variant, pose))
    );

    expect(paths).toEqual([
      '/eno/eno-light-wave.png',
      '/eno/eno-light-open.png',
      '/eno/eno-light-reach.png',
      '/eno/eno-navy-wave.png',
      '/eno/eno-navy-open.png',
      '/eno/eno-navy-reach.png'
    ]);
  });
});
