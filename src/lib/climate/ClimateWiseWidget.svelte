<script lang="ts">
	/**
	 * Dashboard tile. Same footprint as the CreditWise card (article.panel.utility),
	 * so it sits beside it in "Your tools" without layout changes.
	 */
	import { scoreFraction, type ClimateReport } from './emissions';

	let { href = '/climatewise', refresh = 0 }: { href?: string; /** Change to refetch, e.g. after switching customers. */ refresh?: number } = $props();
	let report = $state<ClimateReport | null>(null);

	$effect(() => {
		refresh;
		let cancelled = false;
		report = null; // show "Loading" instead of the previous customer's score
		// same 90-day window as the ClimateWise card, so both show the same score
		fetch('/api/climate?days=90')
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => !cancelled && (report = d?.report ?? null))
			.catch(() => {});
		// a slower response for the previous customer must not overwrite the new one
		return () => (cancelled = true);
	});

	// gauge covers 270° like CreditWise: 0..75% of the conic circle
	let pct = $derived(report ? scoreFraction(report.score) * 75 : 0);
</script>

<article class="panel utility">
	<h2>ClimateWise</h2>
	<div class="row">
		<div class="gauge" style="--p:{pct}%">
			<div>
				<strong>{report ? report.score : '–'}</strong>
				<small>{report ? report.tier : 'Loading'}</small>
			</div>
		</div>
		<div>
			{#if report}
				<p>Your purchases this month added about <b>{Math.round(report.totalKg)} kg CO₂e</b>.</p>
			{:else}
				<p>See the carbon footprint of what you buy.</p>
			{/if}
			<small class="muted">Based on your last 30 days</small>
		</div>
	</div>
	<a class="link" {href}>
		See your score
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
	</a>
</article>

<style>
	.panel {
		/* Uses the dashboard's --dark/--light theme switch, so it follows the dashboard toggle. */
		--cw-green: var(--dark, #4fb27d) var(--light, #2f7a4f);
		--cw-tint: var(--dark, #163329) var(--light, #eaf5ee);
		background: var(--surface, #fff);
		border: 1px solid var(--border, #dae3e8);
		border-radius: 16px;
		box-shadow: var(--shadow, 0 2px 4px #12273408);
		overflow: hidden;
		color: var(--ink, #142632);
		font-family: Inter, system-ui, sans-serif;
	}
	.panel, .panel :global(*) { box-sizing: border-box; }
	.utility {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		padding: 17px;
		min-height: 172px;
		background-image: radial-gradient(260px 120px at 100% 0%, var(--cw-tint) 0%, transparent 70%);
	}
	h2 { margin: 0; font-size: 15px; font-weight: 700; }
	.row { display: flex; align-items: center; gap: 12px; }
	p { margin: 0; font-size: 14px; color: var(--muted, #50636e); }
	p b { color: var(--ink, #142632); font-weight: 650; }
	.muted { font-size: 12px; color: var(--muted, #50636e); }
	.gauge {
		flex: none;
		width: 78px;
		height: 78px;
		padding: 4px;
		border-radius: 50%;
		background: conic-gradient(from 225deg, var(--cw-green) 0 var(--p), var(--border, #dae3e8) var(--p) 75%, transparent 75%);
	}
	.gauge div {
		display: grid;
		width: 100%;
		height: 100%;
		place-content: center;
		text-align: center;
		border-radius: 50%;
		background: var(--surface, #fff);
	}
	.gauge strong { font-size: 24px; line-height: 1; }
	.gauge small { font-size: 10px; color: var(--muted, #50636e); }
	.link {
		margin-top: auto;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 13px;
		font-weight: 750;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--link, #075e80);
		text-decoration: none;
	}
	.link svg { width: 14px; height: 14px; }
</style>
