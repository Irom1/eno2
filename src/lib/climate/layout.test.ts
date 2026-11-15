import { describe, expect, it } from 'vitest';
import { classifyClimateSize, RING_MAX, RING_MIN } from './layout';

describe('classifyClimateSize', () => {
	it('switches mode at the width breakpoints', () => {
		expect(classifyClimateSize(429, 700).mode).toBe('compact');
		expect(classifyClimateSize(430, 700).mode).toBe('medium');
		expect(classifyClimateSize(699, 700).mode).toBe('medium');
		expect(classifyClimateSize(700, 700).mode).toBe('wide');
	});

	it('switches density at the height breakpoints', () => {
		expect(classifyClimateSize(500, 519).density).toBe('short');
		expect(classifyClimateSize(500, 520).density).toBe('regular');
		expect(classifyClimateSize(500, 659).density).toBe('regular');
		expect(classifyClimateSize(500, 660).density).toBe('tall');
	});

	it('only uses the wide layout at wide widths', () => {
		expect(classifyClimateSize(699, 900).layout).toBe('portrait');
		expect(classifyClimateSize(700, 420).layout).toBe('wide');
		expect(classifyClimateSize(900, 760).layout).toBe('wide');
	});

	it('renders 3 list rows when short and 4 otherwise', () => {
		expect(classifyClimateSize(440, 500).listRows).toBe(3);
		expect(classifyClimateSize(440, 600).listRows).toBe(4);
		expect(classifyClimateSize(440, 800).listRows).toBe(4);
	});

	it('keeps the ring an integer inside its bounds', () => {
		for (const [w, h] of [
			[320, 420],
			[360, 640],
			[440, 760],
			[500, 420],
			[700, 520],
			[900, 520],
			[900, 760],
			[1400, 1200]
		]) {
			const { ringSize } = classifyClimateSize(w, h);
			expect(Number.isInteger(ringSize), `${w}x${h}`).toBe(true);
			expect(ringSize).toBeGreaterThanOrEqual(RING_MIN);
			expect(ringSize).toBeLessThanOrEqual(RING_MAX);
		}
	});

	it('scales the ring down for short containers and caps it for tall ones', () => {
		const short = classifyClimateSize(500, 420).ringSize;
		const regular = classifyClimateSize(500, 600).ringSize;
		const tall = classifyClimateSize(500, 900).ringSize;
		expect(short).toBeLessThan(regular);
		expect(tall).toBe(RING_MAX);
	});

	it('defensively clamps invalid and non-finite measurements', () => {
		const invalid = classifyClimateSize(Number.NaN, Number.POSITIVE_INFINITY);
		expect(invalid.mode).toBe('compact');
		expect(invalid.density).toBe('short');
		expect(invalid.layout).toBe('portrait');
		expect(invalid.ringSize).toBe(RING_MIN);
		expect(invalid.listRows).toBe(3);

		const negative = classifyClimateSize(-100, -50);
		expect(negative).toEqual(invalid);
	});
});
