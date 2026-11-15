<script lang="ts">
	import logoLight from '$lib/assets/climatewise-card-logo-light.png';
	import logoDark from '$lib/assets/climatewise-card-logo-dark.png';
	import ScoreCard from '$lib/components/ScoreCard.svelte';
	import { fetchWithSession } from '$lib/sessionRecovery';
	import { SCORE_MAX, scoreFraction, type ClimateReport } from './emissions';

	let { href = '/climatewise', refresh = 0, customerId = '', onAsk }: { href?: string; /** Change to refetch, e.g. after switching customers. */ refresh?: number; customerId?: string; /** Plain-click action; the href stays as the modifier/middle-click fallback. */ onAsk?: () => void } = $props();
	let report = $state<ClimateReport | null>(null);
	let loading = $state(true);

	$effect(() => {
		refresh;
		let cancelled = false;
		report = null;
		loading = true;
		// same 90-day window as the ClimateWise card, so both show the same score
		fetchWithSession('/api/climate?days=90', undefined, customerId)
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => !cancelled && (report = d?.report ?? null))
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
	onActivate={onAsk}
>
	{#snippet description()}
		{#if report}
			Your purchases added about <b>{Math.round(report.totalKg)} kg CO₂e</b>.
		{:else}
			See the carbon footprint of what you buy.
		{/if}
	{/snippet}
</ScoreCard>
