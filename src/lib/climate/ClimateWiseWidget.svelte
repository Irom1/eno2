<script lang="ts">
	import logoLight from '$lib/assets/climatewise-card-logo-light.png';
	import logoDark from '$lib/assets/climatewise-card-logo-dark.png';
	import ScoreCard from '$lib/components/ScoreCard.svelte';
	import { SCORE_MAX, scoreFraction, type ClimateReport } from './emissions';
	import { climateReportCache } from './reportCache';

	let { href = '/climatewise', customerId, accountIds }: { href?: string; customerId: string; accountIds: string[] } = $props();
	let report = $state<ClimateReport | null>(null);
	let loading = $state(true);

	$effect.pre(() => {
		let cancelled = false;
		const cached = climateReportCache.peek(customerId, 90, accountIds);
		report = cached;
		loading = !cached && !!customerId;
		if (!customerId || cached) return;
		// same 90-day window as the ClimateWise card, so both show the same score
		climateReportCache.load(customerId, accountIds)
			.then((loaded) => { if (!cancelled) report = loaded; })
			.catch(() => {})
			.finally(() => { if (!cancelled) loading = false; });
		// a slower response for the previous customer must not overwrite the new one
		return () => (cancelled = true);
	});

	// gauge covers 270° like CreditWise: 0..75% of the conic circle
	let pct = $derived(report ? scoreFraction(report.score) * 75 : 0);
</script>

<ScoreCard
	title="ClimateWise"
	{logoLight}
	{logoDark}
	score={report?.score ?? '–'}
	rating={report?.tier ?? (loading ? 'Loading' : 'Unavailable')}
	scoreLabel={report ? `ClimateWise score: ${report.score} out of ${SCORE_MAX}, ${report.tier}` : `ClimateWise score ${loading ? 'loading' : 'unavailable'}`}
	color="var(--dark, #4fb27d) var(--light, #2f7a4f)"
	progress={pct}
	note={report ? `Based on your last ${report.days} days` : undefined}
	{href}
	linkLabel="Check your LORAX® score"
>
	{#snippet description()}
		{#if report}
			Your purchases added about <b>{Math.round(report.totalKg)} kg CO₂e</b>.
		{:else}
			See the carbon footprint of what you buy.
		{/if}
	{/snippet}
</ScoreCard>
