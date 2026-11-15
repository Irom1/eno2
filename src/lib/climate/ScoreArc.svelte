<script lang="ts">
	/**
	 * Score gauge built from the ClimateWise logo motif:
	 * a dotted arc over the horizon, with the sun marking the score.
	 */
	import { SCORE_MAX, SCORE_MIN, scoreFraction } from './emissions';

	let {
		score = 0,
		tier = '',
		size = 220,
		tone = 'dark'
	}: { score?: number; tier?: string; size?: number; tone?: 'dark' | 'light' } = $props();

	const DOTS = 21;
	const START = 200; // degrees, left of horizon
	const END = -20; // right of horizon
	const cx = 110;
	const cy = 118;
	const r = 92;

	const pt = (deg: number, rad = r) => {
		const a = (deg * Math.PI) / 180;
		return { x: cx + rad * Math.cos(a), y: cy - rad * Math.sin(a) };
	};

	const dots = Array.from({ length: DOTS }, (_, i) => {
		const t = i / (DOTS - 1);
		return { t, ...pt(START + (END - START) * t) };
	});

	let shown = $state(SCORE_MIN);
	$effect(() => {
		// gentle count-up; respects reduced motion
		const target = score;
		if (typeof window === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
			shown = target;
			return;
		}
		const t0 = performance.now();
		let raf = 0;
		const step = (now: number) => {
			const k = Math.min(1, (now - t0) / 900);
			shown = Math.round(SCORE_MIN + (target - SCORE_MIN) * (1 - Math.pow(1 - k, 3)));
			if (k < 1) raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	});

	let sun = $derived(pt(START + (END - START) * scoreFraction(shown)));
</script>

<svg
	class="arc {tone}"
	viewBox="0 0 220 150"
	width={size}
	height={(size * 150) / 220}
	role="img"
	aria-label="LORAXⓇ Score {score} out of {SCORE_MAX}, {tier}"
>
	{#each dots as d}
		<circle cx={d.x} cy={d.y} r="4.2" class:on={d.t <= scoreFraction(shown)} />
	{/each}
	<circle class="sun-glow" cx={sun.x} cy={sun.y} r="17" />
	<circle class="sun" cx={sun.x} cy={sun.y} r="11" />
	<text class="num" x={cx} y="112" text-anchor="middle">{shown}</text>
	<text class="tier" x={cx} y="138" text-anchor="middle">{tier}</text>
</svg>

<style>
	.arc {
		display: block;
		overflow: visible;
		font-family: inherit;
	}
	circle {
		fill: rgba(255, 255, 255, 0.2);
		transition: fill 0.2s;
	}
	circle.on {
		fill: #b9dfc6;
	}
	.light circle {
		fill: #dae3e8;
	}
	.light circle.on {
		fill: #6bb38a;
	}
	.sun {
		fill: #ffbe1a;
	}
	.sun-glow {
		fill: rgba(255, 190, 26, 0.25);
	}
	.num {
		fill: #fff;
		font-size: 58px;
		font-weight: 450;
		letter-spacing: -0.04em;
		font-variant-numeric: tabular-nums;
	}
	.tier {
		fill: rgba(255, 255, 255, 0.82);
		font-size: 13px;
		font-weight: 650;
		letter-spacing: 0.02em;
	}
	.light .num {
		fill: var(--ink, #142632);
	}
	.light .tier {
		fill: var(--muted, #50636e);
	}
</style>
