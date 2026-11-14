<script lang="ts" module>
	export interface RingItem {
		id: string;
		label: string;
		share: number; // 0..1 — angular size of the segment
		fill: number; // 0..1 — how far the solid fill grows outward inside the segment
		color: string; // any CSS color, e.g. var(--cat-transport)
		detail: string;
	}
</script>

<script lang="ts">
	/**
	 * Apple-style "filled" segmented ring. Each segment is a pale slot at full thickness;
	 * a solid fill grows outward from the inner edge to show a 0..1 value.
	 */
	let {
		items,
		centerValue,
		centerUnit,
		selected = $bindable<string | null>(null),
		ariaLabel,
		size = 200
	}: {
		items: RingItem[];
		centerValue: string;
		centerUnit: string;
		selected?: string | null;
		ariaLabel: string;
		size?: number;
	} = $props();

	const S = 220;
	const C = S / 2;
	const R_OUT = 104;
	const R_IN = 62;
	const T = R_OUT - R_IN;
	const GAP = 3.5; // half the gap between segments, px
	const INSET = 3.5; // pale border left around the solid fill, px
	const MIN_FILL = 0.16;

	let hover = $state<string | null>(null);
	let active = $derived(hover ?? selected);
	let activeItem = $derived(items.find((i) => i.id === active) ?? null);

	const pt = (a: number, r: number) => `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`;

	/** Annular sector with rounded corners, drawn as a path shrunk by rc then stroked 2·rc with round joins. */
	function sector(a0: number, a1: number, rIn: number, rOut: number, side: number) {
		const rc = Math.max(0.5, Math.min(9, (rOut - rIn) / 2 - 0.25));
		const ro = rOut - rc;
		const ri = rIn + rc;
		const o0 = a0 + (side + rc) / ro;
		const o1 = a1 - (side + rc) / ro;
		const i0 = a0 + (side + rc) / ri;
		const i1 = a1 - (side + rc) / ri;
		if (o1 <= o0 || i1 <= i0) return null;
		const lo = o1 - o0 > Math.PI ? 1 : 0;
		const li = i1 - i0 > Math.PI ? 1 : 0;
		return {
			d: `M${pt(o0, ro)}A${ro} ${ro} 0 ${lo} 1 ${pt(o1, ro)}L${pt(i1, ri)}A${ri} ${ri} 0 ${li} 0 ${pt(i0, ri)}Z`,
			w: rc * 2
		};
	}

	let segs = $derived.by(() => {
		let a = 0;
		return items
			.filter((i) => i.share > 0)
			.map((i) => {
				const sweep = i.share * Math.PI * 2;
				const a0 = a;
				a += sweep;
				const f = Math.max(MIN_FILL, Math.min(1, i.fill));
				const fillOut = R_IN + INSET + (T - INSET * 2) * f;
				const slot = sector(a0, a, R_IN, R_OUT, GAP);
				const solid = sector(a0, a, R_IN + INSET, fillOut, GAP + INSET);
				// slices too thin for a slot become a dot pair
				const mid = a0 + sweep / 2;
				const rMid = R_IN + T / 2;
				const dotR = Math.max(3.5, Math.min(T / 2 - 1, (sweep * rMid) / 2 - GAP));
				return {
					...i,
					f,
					slot,
					solid,
					dot: { x: C + rMid * Math.sin(mid), y: C - rMid * Math.cos(mid), r: dotR }
				};
			});
	});

	const toggle = (id: string) => (selected = selected === id ? null : id);
</script>

<div class="ring" style="width:{size}px">
	<svg viewBox="0 0 {S} {S}" role="img" aria-label={ariaLabel}>
		{#each segs as s (s.id)}
			<g
				class="seg"
				class:dim={active && active !== s.id}
				style="--c:{s.color}"
				role="button"
				tabindex="0"
				aria-label="{s.label}: {s.detail}"
				onpointerenter={() => (hover = s.id)}
				onpointerleave={() => (hover = null)}
				onclick={() => toggle(s.id)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(s.id))}
			>
				{#if s.slot}
					<path class="slot" d={s.slot.d} stroke-width={s.slot.w} />
					{#if s.solid}<path class="solid" d={s.solid.d} stroke-width={s.solid.w} />{/if}
				{:else}
					<circle class="slot" cx={s.dot.x} cy={s.dot.y} r={s.dot.r} />
					<circle class="solid" cx={s.dot.x} cy={s.dot.y} r={Math.max(2, s.dot.r * (0.35 + 0.5 * s.f))} />
				{/if}
			</g>
		{/each}
	</svg>
	<div class="center" aria-live="polite">
		<strong>{activeItem ? `${Math.round(activeItem.share * 100)}%` : centerValue}</strong>
		<small>{activeItem ? activeItem.label : centerUnit}</small>
	</div>
</div>

<style>
	.ring {
		position: relative;
		flex: none;
		aspect-ratio: 1;
		max-width: 100%;
		container-type: inline-size;
	}
	svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.seg {
		cursor: pointer;
		outline: none;
		transition: opacity 0.2s;
	}
	.seg.dim {
		opacity: 0.35;
	}
	.slot {
		fill: color-mix(in srgb, var(--c) 24%, var(--surface));
		stroke: color-mix(in srgb, var(--c) 24%, var(--surface));
		stroke-linejoin: round;
	}
	circle.slot,
	circle.solid {
		stroke: none;
	}
	.solid {
		fill: var(--c);
		stroke: var(--c);
		stroke-linejoin: round;
	}
	.seg:hover .slot,
	.seg:focus-visible .slot {
		fill: color-mix(in srgb, var(--c) 34%, var(--surface));
		stroke: color-mix(in srgb, var(--c) 34%, var(--surface));
	}
	.center {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		text-align: center;
		pointer-events: none;
	}
	.center strong {
		font-size: clamp(17px, 20cqi, 72px);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
	.center small {
		margin-top: 3px;
		max-width: 48cqi;
		font-size: clamp(9px, 5.4cqi, 16px);
		font-weight: 600;
		line-height: 1.2;
		color: var(--muted);
	}
</style>
