<script lang="ts">
	import RingChart, { type RingItem } from './RingChart.svelte';
	import CategoryIcon from './CategoryIcon.svelte';
	import logoLight from '$lib/assets/climatewise-logo-light.png';
	import { CATEGORIES, CATEGORY_BY_ID, type ClimateReport } from './emissions';
	import { classifyClimateSize } from './layout';
	import { climateReportCache } from './reportCache';

	// Served from static/ so the updated white colorway is used in dark mode.
	const logoDark = '/climatewise/climatewise_logo_compact_dark.png';

	type Theme = 'light' | 'dark' | 'system';

	let {
		customerId = null,
		fill = false,
		embedded = false,
		reportOverride = null,
		theme = $bindable<Theme>(readTheme())
	}: {
		customerId?: string | null;
		/** Fill the parent box (used by the resizable preview) instead of the viewport. */
		fill?: boolean;
		/**
		 * Chat mode: drop the page chrome (min-height, padding, background,
		 * centering, page controls) and let the card size itself naturally.
		 */
		embedded?: boolean;
		/** Use this report (e.g. the chat insight payload) instead of fetching. */
		reportOverride?: ClimateReport | null;
		/** Pass the dashboard's theme in (bind:theme) to keep both pages in sync. */
		theme?: Theme;
	} = $props();

	function readTheme(): Theme {
		try {
			// Same key the dashboard writes, so ClimateWise opens in whatever mode the dashboard was in.
			const t = localStorage.getItem('dashboard-theme');
			if (t === 'light' || t === 'dark' || t === 'system') return t;
		} catch {}
		return 'system';
	}

	let systemDark = $state(false);
	$effect(() => {
		const mq = matchMedia('(prefers-color-scheme: dark)');
		systemDark = mq.matches;
		const on = (e: MediaQueryListEvent) => (systemDark = e.matches);
		mq.addEventListener('change', on);
		return () => mq.removeEventListener('change', on);
	});
	let isDark = $derived(theme === 'dark' || (theme === 'system' && systemDark));
	function toggleTheme() {
		theme = isDark ? 'light' : 'dark';
		try {
			localStorage.setItem('dashboard-theme', theme);
		} catch {}
	}

	// The card adapts to the space it is actually given, not to the viewport or
	// a manual toggle. ResizeObserver report is the card's content box.
	let cardEl: HTMLElement | null = $state(null);
	let cardWidth = $state(0);
	let cardHeight = $state(0);
	const climateSize = $derived(classifyClimateSize(cardWidth, cardHeight));

	$effect(() => {
		if (!cardEl) return;
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			cardWidth = entry.contentRect.width;
			cardHeight = entry.contentRect.height;
		});
		observer.observe(cardEl);
		return () => observer.disconnect();
	});

	const DAYS = 90;
	let attempt = $state(0);
	let fetchedReport = $state<ClimateReport | null>(null);
	// The chat passes the insight report in, so the card never refetches.
	let report = $derived(reportOverride ?? fetchedReport);
	let error = $state('');
	let selected = $state<string | null>(null);
	let hovered = $state<string | null>(null);
	let showInfo = $state(false);

	async function loadReport(id: string | null, signal: AbortSignal) {
		const response = await fetch('/api/session', { signal });
		let session = response.ok ? await response.json() : null;
		if (id && session?.customer?.id !== id) {
			const selected = await fetch('/api/session', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ customerId: id }),
				signal
			});
			if (!selected.ok) throw new Error('Could not select the customer.');
			session = await selected.json();
		}
		if (signal.aborted) throw new Error('Report cancelled.');
		const profileId = id ?? session?.customer?.id;
		if (!profileId || !Array.isArray(session?.accounts)) throw new Error('Could not check this profile’s accounts.');
		return { report: await climateReportCache.load(profileId, session.accounts.map((account: { id: string }) => account.id), DAYS) };
	}

	$effect.pre(() => {
		attempt;
		const override = reportOverride;
		if (override) {
			// The chat already has the insight report; never refetch /api/climate.
			error = '';
			fetchedReport = null;
			hovered = null;
			selected = null;
			return;
		}
		const controller = new AbortController();
		error = '';
		fetchedReport = customerId ? climateReportCache.peek(customerId, DAYS) : null;
		hovered = null;
		selected = null;
		loadReport(customerId, controller.signal)
			.then((data) => {
				if (controller.signal.aborted) return;
				fetchedReport = data.report;
			})
			.catch(() => {
				if (!controller.signal.aborted) error = 'We couldn’t load your emissions report.';
			});
		return () => controller.abort();
	});

	// Theme-aware category colors, from the single source in emissions.ts
	const colorVars = CATEGORIES.map((c) => `--cat-${c.id}: var(--dark, ${c.colorDark}) var(--light, ${c.color})`).join(';');

	const kg = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}` : `${Math.round(n)}`);
	const kgUnit = (n: number) => (n >= 1000 ? 't' : 'kg');
	const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
	const niceDate = (iso: string) =>
		new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	const titleCase = (t: string) =>
		t.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\.Com\b/, '.com');

	// Each slice's size is fixed at that category's typical share of emissions; how thick it fills
	// shows this customer's emissions, scaled so their biggest category fills its slot completely.
	let ringItems = $derived.by((): RingItem[] => {
		if (!report) return [];
		const maxShare = Math.max(0, ...report.categories.map((c) => c.share));
		return report.categories.map((c) => ({
			id: c.id,
			label: c.label,
			share: c.share,
			size: CATEGORY_BY_ID[c.id].typicalShare,
			fill: maxShare ? c.share / maxShare : 0,
			color: `var(--cat-${c.id})`,
			detail: `${Math.round(c.kg)} kg CO₂e · ${money(c.spend)}`
		}));
	});

	// The panel follows the slice under the pointer, falling back to the one tapped; empty until then.
	let activeId = $derived(hovered ?? selected);
	let selectedCat = $derived(report && activeId ? report.categories.find((c) => c.id === activeId) ?? null : null);
	let visiblePurchases = $derived(
		report && selectedCat
			? report.topPurchases
					.filter((p) => p.category === selectedCat.id)
					.slice(0, climateSize.listRows)
			: []
	);
</script>

<div class="cw" class:fill class:embedded data-theme={theme} style={colorVars}>
	<!-- Theme control, matching the dashboard's toggle -->
	<div class="page-controls">
		<button class="page-btn" onclick={toggleTheme} aria-pressed={isDark}
			aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
			<CategoryIcon id={isDark ? 'sun' : 'moon'} size={18} />
		</button>
	</div>

	<article
		class="card"
		bind:this={cardEl}
		data-mode={climateSize.mode}
		data-density={climateSize.density}
		data-layout={climateSize.layout}
		aria-labelledby="cw-title"
	>
		<div class="sky" aria-hidden="true">
			<div class="sky-day"></div>
			<div class="sky-night"></div>
			<div class="sun"><span class="sun-day"></span></div>
		</div>

		<div class="grid">
			<!-- Both logo colorways stacked; the theme picks one -->
			<h1 id="cw-title" class="logo">
				<img class="logo-light" src={logoLight} alt="ClimateWise" width="1000" height="392" />
				<img class="logo-dark" src={logoDark} alt="" aria-hidden="true" width="1000" height="392" />
			</h1>

			{#if error}
				<div class="state"><p>{error}</p><button class="solid" onclick={() => attempt++}>Try again</button></div>
			{:else if !report}
				<div class="state" aria-busy="true"><p>Loading your report…</p></div>
			{:else}
				<section class="foot panel" aria-label="Footprint">
					<p class="foot-label"><span class="foot-icon"><CategoryIcon id="leaf" size={13} /></span>Footprint</p>
					<p class="foot-value">{kg(report.totalKg)}<small>{kgUnit(report.totalKg)}</small></p>
					<p class="foot-sub">CO₂e · last {report.days} days</p>
					<p class="foot-sub">{report.annualizedTonnes} t a year · US avg {report.benchmarkTonnes} t</p>
				</section>

				<section class="chart" aria-label="Carbon emissions by category">
					<div class="chart-head">
						<button class="info" aria-expanded={showInfo} aria-controls="score-info" aria-label="How your LORAX® Score is estimated"
							onclick={() => (showInfo = !showInfo)}>i</button>
						{#if showInfo}
							<p class="info-text" id="score-info">Your LORAX® Score is estimated from purchases over the past {report.days} days.</p>
						{/if}
					</div>

					<div class="ring-wrap" style="--ring:{climateSize.ringSize}px">
						<RingChart
							items={ringItems}
							bind:selected
							bind:hovered
							size={climateSize.ringSize}
							ariaLabel={`LORAX® Score: ${report.score}, ${report.tier}. Carbon emissions by purchase category.`}
							centerValue={String(report.score)}
							centerUnit={report.tier}
						/>
					</div>
				</section>

				<section class="list panel" aria-labelledby="list-title" aria-live="polite">
					<!-- The panel heading is always present in both states (pick or selected),
					     so switching categories never changes the card's height. -->
					{#if selectedCat}
						<div class="list-head">
							<div>
								<h2 id="list-title">{selectedCat.label}</h2>
								<p>{Math.round(selectedCat.share * 100)}% of your emissions · {kg(selectedCat.kg)} {kgUnit(selectedCat.kg)} CO₂e</p>
							</div>
							{#if selected}
								<button class="clear" onclick={() => (selected = null)}>Clear</button>
							{/if}
						</div>
							<div class="items">
							{#each visiblePurchases as p (p.id)}
								<div class="item">
									<span class="ptile" style="--c:var(--cat-{p.category})"><CategoryIcon id={p.category} size={16} /></span>
									<span class="item-text">
										<strong>{titleCase(p.description)}</strong>
										<small>{niceDate(p.date)} · {money(p.amount)}</small>
									</span>
									<span class="item-val">{Math.round(p.kg)} kg</span>
								</div>
							{:else}
								<p class="empty">No purchases in this category.</p>
							{/each}
						</div>
					{:else}
						<!-- Same height as the filled panel, so picking a category never resizes the card -->
						<div class="pick">
							<span class="pick-icon"><CategoryIcon id="chart" size={20} /></span>
							<h2 id="list-title">Select a category to see more</h2>
							<p>Hover over or tap a slice of the chart to see its biggest purchases.</p>
						</div>
					{/if}
				</section>
			{/if}
		</div>
	</article>
</div>

<style>
	/* Same --dark / --light switch the dashboard uses. */
	.cw {
		--dark: ;
		--light: initial;
		--page: var(--dark, #171717) var(--light, #eef2f6);
		--glass: var(--dark, rgba(30, 30, 30, 0.94)) var(--light, rgba(255, 255, 255, 0.62));
		--glass-strong: var(--dark, rgba(36, 36, 36, 0.96)) var(--light, rgba(255, 255, 255, 0.85));
		--glass-edge: var(--dark, rgba(255, 255, 255, 0.08)) var(--light, rgba(255, 255, 255, 0.75));
		--surface: var(--dark, #242424) var(--light, #ffffff);
		--sunken: var(--dark, rgba(255, 255, 255, 0.05)) var(--light, rgba(16, 39, 58, 0.04));
		--ink: var(--dark, #f2f2f2) var(--light, #10273a);
		--muted: var(--dark, #bdbdbd) var(--light, #5a6b79);
		--border: var(--dark, rgba(255, 255, 255, 0.1)) var(--light, rgba(16, 39, 58, 0.1));
		--link: var(--dark, #7cc8f2) var(--light, #0276b1);
		--leaf: var(--dark, #59c26f) var(--light, #3aa548);
		color-scheme: var(--dark, dark) var(--light, light);
		box-sizing: border-box;
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 72px 16px 24px;
		background: var(--page);
		color: var(--ink);
		font: 15px/1.4 var(--font-sans);
	}
	/* Fill mode: the card owns exactly the parent's box (resizable preview). */
	.cw.fill {
		position: relative;
		min-height: 0;
		height: 100%;
		display: block;
		padding: 0;
		background: transparent;
	}
	/* Embedded chat mode: no page chrome, and the card sizes to its content. */
	.cw.embedded {
		position: relative;
		min-height: 0;
		height: auto;
		display: block;
		padding: 0;
		background: transparent;
		/* Fixed list contract (normal density):
		   24px padding + 52px head (44 + 8) + 198px body = 274px. */
		--cw-list-pad: 24px;
		--cw-list-head: 52px;
		--cw-list-body: 198px;
	}
	.cw.embedded .page-controls { display: none; }
	.cw.embedded .card {
		width: 100%;
		max-width: 100%;
		height: auto;
		box-sizing: border-box;
		border: var(--chat-bubble-border);
		border-radius: var(--assistant-bubble-radius);
		/* Standalone chat card has no bubble tail: keep the bottom-left corner rounded. */
		border-bottom-left-radius: var(--bubble-radius);
		box-shadow: none;
	}
	/* With no fixed card height, let the grid size to its content and pin the
	   list to one exact height, so hover/select/clear can never resize the card. */
	.cw.embedded .card > .grid { flex: none; }
	.cw.embedded .list {
		flex: none;
		min-width: 0;
		height: calc(var(--cw-list-pad) + var(--cw-list-head) + var(--cw-list-body));
	}
	/* The list body fills whatever the fixed height leaves; never grow the list. */
	.cw.embedded .pick,
	.cw.embedded .items {
		flex: 1;
		min-height: 0;
	}
	/* Short density: 14px padding + 33px head (30 + 3) + 124px body = 171px. */
	.cw.embedded .card[data-density='short'] {
		--cw-list-pad: 14px;
		--cw-list-head: 33px;
		--cw-list-body: 124px;
	}
	.cw[data-theme='dark'] { --dark: initial; --light: ; }
	@media (prefers-color-scheme: dark) { .cw[data-theme='system'] { --dark: initial; --light: ; } }
	.cw :global(*), .cw :global(*::before), .cw :global(*::after) { box-sizing: border-box; }
	h1, h2, p { margin: 0; }
	button { font: inherit; }

	/* Theme control: top-right of the page, or the card's top strip in fill mode */
	.page-controls { position: fixed; top: 16px; right: 16px; z-index: 10; display: flex; gap: 8px; }
	.cw.fill .page-controls { position: absolute; top: 10px; right: 10px; }
	.page-btn {
		display: grid; place-items: center; width: 42px; height: 42px; padding: 0;
		border: 1px solid var(--border); border-radius: 50%; background: var(--page); color: var(--ink); cursor: pointer;
	}
	.page-btn:hover { background: var(--surface); }

	.card {
		position: relative;
		isolation: isolate;
		display: flex;
		flex-direction: column;
		min-height: 0;
		width: min(820px, 100%);
		height: min(820px, calc(100dvh - 96px));
		border-radius: 26px;
		box-shadow: 0 1px 2px #0000000f, 0 20px 50px #0b1a2a2e;
		overflow: hidden;
	}
	.cw.fill .card { width: 100%; height: 100%; border-radius: 22px; }
	.card > :not(.sky) { position: relative; z-index: 1; }

	/* Sky: white-topped day in light mode, near-black night in dark mode */
	.sky { position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
	.sky-day, .sky-night { position: absolute; inset: 0; }
	.sky-day {
		/* clean white top half; muted green/blue washes only in the lower half, still curving on a diagonal */
		background:
			linear-gradient(180deg, #ffffff 0%, #ffffff 40%, rgba(255, 255, 255, 0) 72%),
			radial-gradient(110% 60% at 0% 85%, rgba(150, 214, 200, 0.55) 0%, rgba(150, 214, 200, 0) 70%),
			radial-gradient(120% 70% at 95% 110%, rgba(120, 180, 230, 0.55) 0%, rgba(120, 180, 230, 0) 70%),
			linear-gradient(160deg, #f6f9fb 0%, #e6f2ee 55%, #d6e8f5 100%);
		opacity: var(--dark, 0) var(--light, 1);
	}
	.sky-night {
		/* near-black top easing into deep navy, with a faint teal glow low down */
		background:
			linear-gradient(180deg, #03060c 0%, #050b18 38%, rgba(5, 11, 24, 0) 72%),
			radial-gradient(110% 60% at 100% 80%, rgba(11, 80, 72, 0.55) 0%, rgba(11, 80, 72, 0) 70%),
			radial-gradient(130% 70% at 15% 112%, rgba(14, 52, 96, 0.55) 0%, rgba(14, 52, 96, 0) 70%),
			linear-gradient(200deg, #060d1e 0%, #0a1d40 55%, #0b2f3e 100%);
		opacity: var(--dark, 1) var(--light, 0);
	}
	.sun {
		position: absolute;
		left: 50%;
		top: 0;
		width: 90vmax;
		aspect-ratio: 1;
		margin-left: -45vmax;
		transform: translate(var(--dark, 8vw) var(--light, -26vw), var(--dark, 54vh) var(--light, -44vmax));
	}
	.sun span { position: absolute; inset: 0; border-radius: 50%; }
	/* kept faint so the white top stays white */
	.sun-day { background: radial-gradient(circle, rgba(255, 246, 180, 0.95) 0%, rgba(255, 226, 110, 0.5) 22%, transparent 55%); opacity: var(--dark, 0) var(--light, 0.1); }

	/* ---- Portrait/wide: logo over footprint on the left, chart top-right, then purchases ---- */
	.grid {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-rows: auto auto minmax(0, 1fr) auto;
		grid-template-areas:
			'logo chart'
			'foot chart'
			'list list'
			'state state';
		align-items: start;
		gap: 20px 14px;
		padding: 20px 16px 18px;
	}
	/* Leave a clean strip for the theme control in fill mode. */
	.cw.fill .card .grid { padding-top: 52px; }
	.logo { grid-area: logo; display: grid; width: 140px; margin-top: 4px; padding: 8px 0 0 8px; box-sizing: border-box; }
	.logo img { grid-area: 1 / 1; width: 100%; height: auto; }
	.logo-light { opacity: var(--dark, 0) var(--light, 1); }
	.logo-dark { opacity: var(--dark, 1) var(--light, 0); }

	.panel {
		border: 1px solid var(--glass-edge); border-radius: 18px;
		background: var(--glass); backdrop-filter: blur(18px) saturate(1.2);
		box-shadow: 0 8px 22px rgba(20, 45, 70, 0.1);
	}

	.foot { grid-area: foot; padding: 10px 12px; min-width: 140px; }
	.foot-label { display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 650; color: var(--muted); }
	.foot-icon {
		display: grid; place-items: center; width: 20px; height: 20px; border-radius: 6px;
		background: var(--dark, rgba(89, 194, 111, 0.2)) var(--light, #dcf3dc); color: var(--dark, #8fe0a0) var(--light, #2a7a3a);
	}
	.foot-value { margin-top: 4px; font-size: 24px; font-weight: 750; letter-spacing: -0.03em; line-height: 1.1; font-variant-numeric: tabular-nums; }
	.foot-value small { margin-left: 2px; font-size: 13px; font-weight: 600; letter-spacing: 0; color: var(--muted); }
	.foot-sub { font-size: 11px; color: var(--muted); }

	.chart { grid-area: chart; align-self: start; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 0 0 4px; }
	/* Info control owns the card's top-right corner, above the ring. */
	.chart-head { position: relative; z-index: 4; display: flex; justify-content: flex-end; align-items: center; gap: 6px; width: 100%; }
	.info { width: 17px; height: 17px; padding: 0; border: 1.3px solid var(--muted); border-radius: 50%; background: none; color: var(--muted); font-family: Georgia, serif; font-size: 10px; font-weight: 700; line-height: 1; cursor: pointer; }
	.info:hover, .info[aria-expanded='true'] { border-color: var(--link); color: var(--link); }
	.info-text {
		/* Right-anchored to the icon so the popover opens below/left and cannot
		   be clipped by the card's right edge. */
		position: absolute; top: calc(100% + 8px); right: 0; left: auto; width: min(240px, calc(100vw - 48px));
		padding: 10px 12px; border-radius: 12px; border: 1px solid var(--glass-edge);
		background: var(--glass-strong); backdrop-filter: blur(18px); box-shadow: 0 10px 28px #0b1a2a33;
		font-size: 12px; line-height: 1.4; color: var(--muted); text-align: center;
	}
	/* The ring diameter is driven by the measured card size (--ring). */
	.ring-wrap {
		flex: none;
		width: calc(var(--ring) + 20px);
		height: calc(var(--ring) + 20px);
		max-width: 100%;
		padding: 10px;
		border-radius: 50%;
		background: var(--glass-strong);
		backdrop-filter: blur(18px);
		box-shadow: 0 0 0 1px var(--glass-edge), 0 14px 36px rgba(20, 45, 70, 0.14);
	}

	.list { grid-area: list; align-self: stretch; display: flex; flex-direction: column; min-height: 0; padding: 14px 14px 10px; }
	/*
	 * The list head and CTA stay put; only the rows themselves scroll, so hovering
	 * between categories never changes the card's size or shifts the ring.
	 */
	.list-head { flex: none; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; height: 44px; margin-bottom: 8px; }
	.list-head > div { min-width: 0; }
	.list-head h2, .list-head p { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.list-head h2 { font-size: 16px; font-weight: 750; letter-spacing: -0.02em; line-height: 1.2; }
	.list-head p { margin-top: 2px; font-size: 12.5px; color: var(--muted); }
	.pick { flex: 1; min-height: 0; overflow: auto; display: grid; place-content: center; justify-items: center; gap: 6px; padding: 0 12px; text-align: center; }
	.pick-icon { display: grid; place-items: center; width: 40px; height: 40px; margin-bottom: 4px; border-radius: 12px; background: var(--sunken); color: var(--muted); }
	.pick h2 { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
	.pick p { max-width: 230px; font-size: 12.5px; line-height: 1.45; color: var(--muted); }
	.clear { flex: none; padding: 2px 0; border: 0; background: none; color: var(--link); font-size: 12.5px; font-weight: 650; cursor: pointer; }

	/* Clean list items: pastel tile, bold title, quiet detail — no dividers */
	.items {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		display: grid;
		align-content: start;
		grid-auto-rows: 48px;
		gap: 2px;
		margin: 0 -6px;
		padding-right: 6px;
		scrollbar-width: thin;
	}
	.item { display: flex; align-items: center; gap: 12px; padding: 0 6px; border-radius: 14px; color: var(--ink); }
	.ptile {
		display: grid; place-items: center; flex: none; width: 34px; height: 34px; border-radius: 10px;
		background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c);
	}
	.item-text { flex: 1; display: grid; gap: 1px; min-width: 0; }
	.item-text strong { font-size: 14px; font-weight: 650; letter-spacing: -0.01em; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.item-text small { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.item-val { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.empty { padding: 10px 6px; color: var(--muted); font-size: 13px; }

	.state { position: absolute; inset: 0; z-index: 2; display: grid; gap: 12px; place-content: center; justify-items: center; padding: 32px; color: var(--muted); text-align: center; }
	.solid { min-height: 36px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--link); color: #fff; font-weight: 700; cursor: pointer; }

	/* ---- Compact widths: tighter chrome, smaller logo, bigger sky ---- */
	/* Stacked fallback: footprint stays beside the logo and the chart spans the card. */
	.card[data-mode='compact'] .grid {
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas: 'logo foot' 'chart chart' 'list list' 'state state';
		gap: 14px 12px;
		padding-left: 12px;
		padding-right: 12px;
		padding-bottom: 14px;
	}
	.card[data-mode='compact'] .logo { width: 124px; }
	.card[data-mode='compact'] .foot { min-width: 0; }
	.card[data-mode='compact'] .sun { width: 140vmax; margin-left: -70vmax; }

	/* ---- Short heights: compress fixed chrome so the list can still breathe ---- */
	.card[data-density='short'] .grid { gap: 10px 12px; padding-bottom: 8px; }
	.card[data-density='short'] .chart { gap: 8px; padding-block: 0; }
	.card[data-density='short'] .info { width: 15px; height: 15px; font-size: 9px; }
	.card[data-density='short'] .foot { padding: 6px 9px; }
	.card[data-density='short'] .foot-label { font-size: 10.5px; }
	.card[data-density='short'] .foot-icon { width: 17px; height: 17px; }
	.card[data-density='short'] .foot-value { margin-top: 2px; font-size: 19px; }
	.card[data-density='short'] .foot-value small { font-size: 11px; }
	.card[data-density='short'] .foot-sub { font-size: 10px; }
	.card[data-density='short'] .list { padding: 8px 10px 6px; }
	.card[data-density='short'] .list-head { height: auto; min-height: 30px; margin-bottom: 3px; }
	.card[data-density='short'] .list-head h2 { font-size: 14px; }
	.card[data-density='short'] .list-head p { margin-top: 1px; font-size: 11.5px; }
	.card[data-density='short'] .items { grid-auto-rows: 40px; }
	.card[data-density='short'] .item-text strong { font-size: 13px; }
	.card[data-density='short'] .pick { gap: 2px; }
	.card[data-density='short'] .pick-icon { width: 28px; height: 28px; margin-bottom: 0; }
	.card[data-density='short'] .pick h2 { font-size: 13.5px; }
	.card[data-density='short'] .pick p { font-size: 11.5px; }
</style>
