export type ClimateMode = 'compact' | 'medium' | 'wide';
export type ClimateDensity = 'short' | 'regular' | 'tall';

export interface ClimateSize {
	mode: ClimateMode;
	density: ClimateDensity;
	layout: 'portrait' | 'wide';
	ringSize: number;
	listRows: number;
}

/** Ring diameter bounds, in CSS pixels. */
export const RING_MIN = 150;
export const RING_MAX = 260;

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

/** Treat unusable measurements (NaN, Infinity, negatives) as zero. */
const measure = (value: number) =>
	Number.isFinite(value) ? Math.max(0, value) : 0;

/**
 * Classify the space a ClimateWise card actually has. This is deliberately
 * pure and viewport-agnostic: the card feeds it its own content-box size so a
 * resizable preview behaves exactly like the real page.
 */
export function classifyClimateSize(width: number, height: number): ClimateSize {
	const w = measure(width);
	const h = measure(height);

	const mode: ClimateMode = w < 430 ? 'compact' : w < 700 ? 'medium' : 'wide';
	const density: ClimateDensity = h < 520 ? 'short' : h < 660 ? 'regular' : 'tall';

	// In wide mode the ring is limited by height (the side columns own the
	// width); in portrait it has to share both axes with logo, list, and CTA.
	const preferred = mode === 'wide' ? h * 0.42 : Math.min(w * 0.52, h * 0.34);
	const ringSize = Math.round(clamp(preferred, RING_MIN, RING_MAX));

	return {
		mode,
		density,
		layout: mode === 'wide' ? 'wide' : 'portrait',
		ringSize,
		listRows: density === 'short' ? 3 : 4
	};
}
