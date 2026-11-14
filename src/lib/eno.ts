export type EnoVariant = 'light' | 'dark';

export function enoSrc(variant: EnoVariant): string {
  return `/eno/eno_logo_${variant}.png`;
}
