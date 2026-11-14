<script lang="ts" module>
	export interface RingItem {
		id: string;
		label: string;
		share: number; // 0..1 — the segment's share, for the page's own use
		size: number; // relative angular size of the segment; fixed, so the ring's shape never changes
		fill: number; // 0..1 — how far the solid fill grows outward inside the segment (0 = empty slot)
		color: string; // any CSS color, e.g. var(--cat-transport)
		detail: string;
	}
</script>

<script lang="ts">
	/**
	 * Apple-style "filled" segmented ring. Every item gets a fixed slice (sized by `size`) shown as a pale slot;
	 * a solid fill grows outward from the inner edge to show its 0..1 value.
	 */
	let {
		items,
		centerValue,
		centerUnit,
		selected = $bindable<string | null>(null),
		hovered = $bindable<string | null>(null),
		ariaLabel,
		size = 200
	}: {
		items: RingItem[];
		centerValue: string;
		centerUnit: string;
		selected?: string | null;
		/** The segment under the pointer, so the page can follow it too. */
		hovered?: string | null;
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
	const MIN_FILL = 0.1; // smallest visible fill for a non-zero value

	let active = $derived(hovered ?? selected);

	const pt = (a: number, r: number) => `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`;

	/** Annular sector with rounded corners, drawn as a path shrunk by rc then stroked 2·rc with round joins. */
	function sector(a0: number, a1: number, rIn: number, rOut: number, side: number) {
		// corner radius also limited by the inner arc, so narrow slices keep their shape instead of vanishing
		const rc = Math.max(0.5, Math.min(9, (rOut - rIn) / 2 - 0.25, ((a1 - a0) * rIn - 2 * side) / 2 - 0.5));
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
		const total = items.reduce((s, i) => s + i.size, 0) || 1;
		let a = 0;
		return items.map((i) => {
			const a0 = a;
			const a1 = (a += (i.size / total) * Math.PI * 2);
			const f = i.fill > 0 ? Math.max(MIN_FILL, Math.min(1, i.fill)) : 0;
			const fillOut = R_IN + INSET + (T - INSET * 2) * f;
			return {
				...i,
				slot: sector(a0, a1, R_IN, R_OUT, GAP),
				solid: f > 0 ? sector(a0, a1, R_IN + INSET, fillOut, GAP + INSET) : null
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
				onpointerenter={() => (hovered = s.id)}
				onpointerleave={() => (hovered = null)}
				onfocus={() => (hovered = s.id)}
				onblur={() => (hovered = null)}
				onclick={() => toggle(s.id)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(s.id))}
			>
				{#if s.slot}<path class="slot" d={s.slot.d} stroke-width={s.slot.w} />{/if}
				{#if s.solid}<path class="solid" d={s.solid.d} stroke-width={s.solid.w} />{/if}
			</g>
		{/each}
	</svg>
	<!-- The centre always shows the headline value; segment details live outside the ring -->
	<div class="center">
		<strong>{centerValue}</strong>
		<small>{centerUnit}</small>
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
