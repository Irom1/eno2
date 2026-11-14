<script lang="ts">
	/** Compact ClimateWise mark: half-globe, dotted arc, sun (from the team's logo). */
	let { size = 36 }: { size?: number } = $props();
	const dots = Array.from({ length: 11 }, (_, i) => {
		const a = ((200 - 220 * (i / 10)) * Math.PI) / 180;
		return { x: 32 + 26 * Math.cos(a), y: 40 - 26 * Math.sin(a) };
	});
</script>

<svg width={size} height={size} viewBox="0 0 64 52" aria-hidden="true">
	{#each dots as d, i}
		{#if i !== 7}<circle cx={d.x} cy={d.y} r="2.1" fill="#a6cadb" />{/if}
	{/each}
	<circle cx={dots[7].x} cy={dots[7].y} r="6" fill="#ffbe1a" />
	<path d="M14 46a18 18 0 0 1 36 0z" fill="#1a7ff0" />
	<path d="M19.5 37.5c3-3 6-4 8.5-2.2 1.6 1.2.4 3.3-1.6 3.6-2.4.4-3 2.7-5.3 2.6M37.5 31c2.6.3 4.2 2 4.5 4.6-2 .6-3.6-.4-4.5-2.2z" fill="#5ec47d" />
</svg>
