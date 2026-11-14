export type EnoVariant = 'light' | 'navy';
export type EnoPose = 'wave' | 'open' | 'reach';

export interface EnoFrame {
  readonly pose: EnoPose;
  readonly duration: number;
}

/**
 * Frames shown while Eno is thinking. The middle pose is a deliberately short
 * beat so the cycle reads as a wave rather than a slow three-pose slideshow.
 */
export const ENO_FRAMES: readonly EnoFrame[] = [
  { pose: 'wave', duration: 520 },
  { pose: 'open', duration: 160 },
  { pose: 'reach', duration: 520 }
];

export function enoSrc(variant: EnoVariant, pose: EnoPose): string {
  return `/eno/eno-${variant}-${pose}.png`;
}

export function nextEnoFrame(index: number): number {
  return (index + 1) % ENO_FRAMES.length;
}
