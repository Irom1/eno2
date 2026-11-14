import { describe, expect, it } from 'vitest';
import { enoSrc } from './eno';

describe('enoSrc', () => {
  it('returns the light-mode logo path', () => {
    expect(enoSrc('light')).toBe('/eno/eno_logo_light.png');
  });

  it('returns the dark-mode logo path', () => {
    expect(enoSrc('dark')).toBe('/eno/eno_logo_dark.png');
  });
});
