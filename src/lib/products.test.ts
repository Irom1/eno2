import { describe, expect, it } from 'vitest';
import { loanProduct, products } from './products';

describe('products', () => {
  it('gives the Discover it card an iridescent mesh background', () => {
    const gradient = products.discover.gradient;
    const radialLayers = gradient.match(/radial-gradient/g) ?? [];

    expect(radialLayers).toHaveLength(6);
    expect(gradient).toContain('#96b8e8');
    expect(gradient).toContain('data:image/svg+xml');
    // The grain layer must sit first so the color mesh renders beneath it.
    expect(gradient.startsWith('url("data:image/svg+xml')).toBe(true);
    expect(gradient.endsWith('#96b8e8')).toBe(true);
  });

  it('uses dark navy ink on the Discover it card in both themes', () => {
    expect(products.discover.ink).toBe('#1c2633');
    expect(products.discover.ink).not.toContain('light-dark');
  });

  it('keeps the Discover personal loan on its original themed gradient', () => {
    const personal = loanProduct('personal')!;

    expect(personal.gradient).not.toBe(products.discover.gradient);
    expect(personal.gradient).not.toContain('radial-gradient');
    expect(personal.gradient).toContain('#b7b9bc');
    expect(personal.gradient).toContain('#eff0f1');
    expect(personal.gradient).toContain('#f2b88a');
    expect(personal.ink).toBe('light-dark(#24201c, #f7f7f7)');
  });
});
