<script lang="ts">
	import RingChart, { type RingItem } from './RingChart.svelte';
	import CategoryIcon from './CategoryIcon.svelte';
	import logoLight from '$lib/assets/climatewise-logo-light.png';
	import logoDark from '$lib/assets/climatewise-logo-dark.png';
	import { CATEGORIES, CATEGORY_BY_ID, type ClimateReport } from './emissions';

	type Theme = 'light' | 'dark' | 'system';
	type Layout = 'portrait' | 'landscape';

	let {
		customerId = null,
		backHref = '/dashboard',
		enoHref = (prompt: string) => `/chat?ask=${encodeURIComponent(prompt)}`,
		theme = $bindable<Theme>(readTheme())
	}: {
		customerId?: string | null;
		backHref?: string;
		enoHref?: (prompt: string) => string;
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

	// Landscape only applies on wide screens (see CSS); narrower ones always get portrait.
	let layout = $state<Layout>(readLayout());
	function readLayout(): Layout {
		try {
			if (localStorage.getItem('climatewise-layout') === 'landscape') return 'landscape';
		} catch {}
		return 'portrait';
	}
	function toggleLayout() {
		layout = layout === 'portrait' ? 'landscape' : 'portrait';
		try {
			localStorage.setItem('climatewise-layout', layout);
		} catch {}
	}

	const DAYS = 90;
	let attempt = $state(0);
	let report = $state<ClimateReport | null>(null);
	let error = $state('');
	let selected = $state<string | null>(null);
	let showInfo = $state(false);

	async function loadReport(id: string | null, signal: AbortSignal) {
		if (id) {
			const response = await fetch('/api/session', { signal });
			const session = response.ok ? await response.json() : null;
			if (session?.customer?.id !== id) {
				const selected = await fetch('/api/session', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ customerId: id }),
					signal
				});
				if (!selected.ok) throw new Error('Could not select the customer.');
			}
		}
		const response = await fetch(`/api/climate?days=${DAYS}`, { signal });
		if (!response.ok) throw new Error('Could not load the report.');
		return response.json() as Promise<{ report: ClimateReport }>;
	}

	$effect(() => {
		attempt;
		const controller = new AbortController();
		error = '';
		report = null;
		hovered = null;
		selected = null;
		loadReport(customerId, controller.signal)
			.then((data) => {
				if (controller.signal.aborted) return;
				report = data.report;
			})
			.catch(() => {
				if (!controller.signal.aborted) error = 'We couldn’t load your ClimateWise report.';
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

	// Every category gets the same fixed slice; how thick it fills shows its emissions,
	// scaled so the biggest category fills its slot completely.
	let ringItems = $derived.by((): RingItem[] => {
		if (!report) return [];
		const maxShare = Math.max(0, ...report.categories.map((c) => c.share));
		return report.categories.map((c) => ({
			id: c.id,
			label: c.label,
			share: c.share,
			fill: maxShare ? c.share / maxShare : 0,
			color: `var(--cat-${c.id})`,
			detail: `${Math.round(c.kg)} kg CO₂e · ${money(c.spend)}`
		}));
	});

	// Purchases list follows the slice under the pointer, falling back to the one tapped.
	let hovered = $state<string | null>(null);
	let activeId = $derived(hovered ?? selected);
	let selectedCat = $derived(report && activeId ? report.categories.find((c) => c.id === activeId) ?? null : null);
	// How green the choices are: the active category's, or all everyday spending when none is active.
	// Overall is the spend-weighted average of the categories, so it's on the same scale as each one.
	let overallGreen = $derived.by(() => {
		if (!report) return 0;
		const spend = report.categories.reduce((s, c) => s + c.spend, 0);
		return spend ? report.categories.reduce((s, c) => s + c.greenness * c.spend, 0) / spend : 0;
	});
	let greenness = $derived(selectedCat ? selectedCat.greenness : overallGreen);
	const greenWord = (g: number) => (g >= 0.65 ? 'Mostly green choices' : g >= 0.4 ? 'Mixed choices' : 'Room to improve');
	let visiblePurchases = $derived.by(() => {
		if (!report) return [];
		const rows = selectedCat ? report.topPurchases.filter((p) => p.category === selectedCat.id) : report.topPurchases;
		return rows.slice(0, 4);
	});

	// "Eno ideas" opens the chat with the personalised swaps already in the question.
	let enoSaving = $derived(report ? report.nudges.reduce((s, n) => s + n.savingKgPerMonth, 0) : 0);
	let enoPrompt = $derived(
		report?.nudges.length
			? `Help me cut my carbon emissions by about ${enoSaving} kg a month. ClimateWise suggests: ${report.nudges
					.map((n) => n.title[0].toLowerCase() + n.title.slice(1))
					.join('; ')}. Where should I start?`
			: 'Help me lower the carbon footprint of my spending.'
	);
</script>

<div class="cw" data-theme={theme} style={colorVars}>
	<!-- Page-level controls, off the card, matching the dashboard's toggle -->
	<div class="page-controls">
		<button class="page-btn layout-toggle" onclick={toggleLayout}
			aria-label={layout === 'portrait' ? 'Switch to landscape layout' : 'Switch to portrait layout'}
			title={layout === 'portrait' ? 'Landscape layout' : 'Portrait layout'}>
			<CategoryIcon id={layout === 'portrait' ? 'landscape' : 'portrait'} size={18} />
		</button>
		<button class="page-btn" onclick={toggleTheme} aria-pressed={isDark}
			aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
			<CategoryIcon id={isDark ? 'sun' : 'moon'} size={18} />
		</button>
	</div>

	<article class="card {layout}" aria-labelledby="cw-title">
		<div class="sky" aria-hidden="true">
			<div class="sky-day"></div>
			<div class="sky-night"></div>
			<div class="sun"><span class="sun-day"></span></div>
		</div>

		<a class="close" href={backHref} aria-label="Close and go back to dashboard" title="Close">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
		</a>

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

				<section class="chart" aria-labelledby="chart-title">
					<div class="chart-head">
						<h2 class="chart-title" id="chart-title">Carbon emissions by category</h2>
						<button class="info" aria-expanded={showInfo} aria-controls="score-info" aria-label="How your score is estimated"
							onclick={() => (showInfo = !showInfo)}>i</button>
						{#if showInfo}
							<p class="info-text" id="score-info">ClimateWise score estimated from purchases over the past {report.days} days.</p>
						{/if}
					</div>

					<div class="ring-wrap">
						<RingChart
							items={ringItems}
							bind:selected
							bind:hovered
							size={220}
							ariaLabel="Carbon emissions by purchase category"
							centerValue={String(report.score)}
							centerUnit={report.tier}
						/>
					</div>

					<a class="eno" href={enoHref(enoPrompt)}>
						<CategoryIcon id="sparkle" size={14} />
						<span>Eno ideas</span>
						{#if enoSaving > 0}<small>save ~{enoSaving} kg/mo</small>{/if}
						<CategoryIcon id="chevron" size={13} />
					</a>
				</section>

				<section class="list panel" aria-labelledby="list-title">
					<div class="list-head">
						<div>
							<h2 id="list-title">{selectedCat ? selectedCat.label : 'Highest-impact purchases'}</h2>
							<p>
								{selectedCat
									? `${Math.round(selectedCat.share * 100)}% of your emissions · ${kg(selectedCat.kg)} ${kgUnit(selectedCat.kg)} CO₂e`
									: 'The purchases that added the most CO₂e.'}
							</p>
						</div>
						{#if selected}
							<button class="clear" onclick={() => (selected = null)}>Show all</button>
						{/if}
					</div>
					{#if !selectedCat || selectedCat.count > 0}
					<div class="green" style="--c:{selectedCat ? `var(--cat-${selectedCat.id})` : 'var(--leaf)'}">
						<div class="green-row">
							<span>{selectedCat ? 'How green' : 'How green overall'}</span>
							<b>{Math.round(greenness * 100)}% · {greenWord(greenness)}</b>
						</div>
						<div class="green-track"><div class="green-fill" style="width:{Math.round(greenness * 100)}%"></div></div>
					</div>
					{/if}
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
					<a class="cta" href={backHref}>View all activity <CategoryIcon id="chevron" size={14} /></a>
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
		font: 15px/1.4 Inter, system-ui, sans-serif;
	}
	.cw[data-theme='dark'] { --dark: initial; --light: ; }
	@media (prefers-color-scheme: dark) { .cw[data-theme='system'] { --dark: initial; --light: ; } }
	.cw :global(*), .cw :global(*::before), .cw :global(*::after) { box-sizing: border-box; }
	h1, h2, p { margin: 0; }
	button { font: inherit; }

	/* Page controls: layout + theme, top-right of the screen */
	.page-controls { position: fixed; top: 16px; right: 16px; z-index: 10; display: flex; gap: 8px; }
	.page-btn {
		display: grid; place-items: center; width: 42px; height: 42px; padding: 0;
		border: 1px solid var(--border); border-radius: 50%; background: var(--page); color: var(--ink); cursor: pointer;
	}
	.page-btn:hover { background: var(--surface); }

	.card {
		position: relative;
		isolation: isolate;
		width: min(440px, 100%);
		border-radius: 26px;
		box-shadow: 0 1px 2px #0000000f, 0 20px 50px #0b1a2a2e;
		overflow: hidden;
	}
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

	.close {
		position: absolute !important; top: 12px; right: 12px; z-index: 6 !important;
		display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; color: var(--muted);
	}
	.close:hover { background: var(--sunken); color: var(--ink); }

	/* ---- Portrait: logo | footprint, then chart, then purchases ---- */
	.grid {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-areas: 'logo foot' 'chart chart' 'list list' 'state state';
		align-items: start;
		gap: 14px 12px;
		padding: 20px 16px 18px;
	}
	.logo { grid-area: logo; display: grid; width: 140px; margin-top: 4px; }
	.logo img { grid-area: 1 / 1; width: 100%; height: auto; }
	.logo-light { opacity: var(--dark, 0) var(--light, 1); }
	.logo-dark { opacity: var(--dark, 1) var(--light, 0); }

	.panel {
		border: 1px solid var(--glass-edge); border-radius: 18px;
		background: var(--glass); backdrop-filter: blur(18px) saturate(1.2);
		box-shadow: 0 8px 22px rgba(20, 45, 70, 0.1);
	}

	.foot { grid-area: foot; margin-right: 30px; /* clear the close button */ padding: 10px 12px; min-width: 140px; }
	.foot-label { display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 650; color: var(--muted); }
	.foot-icon {
		display: grid; place-items: center; width: 20px; height: 20px; border-radius: 6px;
		background: var(--dark, rgba(89, 194, 111, 0.2)) var(--light, #dcf3dc); color: var(--dark, #8fe0a0) var(--light, #2a7a3a);
	}
	.foot-value { margin-top: 4px; font-size: 24px; font-weight: 750; letter-spacing: -0.03em; line-height: 1.1; font-variant-numeric: tabular-nums; }
	.foot-value small { margin-left: 2px; font-size: 13px; font-weight: 600; letter-spacing: 0; color: var(--muted); }
	.foot-sub { font-size: 11px; color: var(--muted); }

	.chart { grid-area: chart; display: flex; flex-direction: column; align-items: center; gap: 10px; }
	.chart-head { position: relative; z-index: 4; display: flex; align-items: center; gap: 6px; }
	.chart-title { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; color: var(--ink); }
	.info { width: 17px; height: 17px; padding: 0; border: 1.3px solid var(--muted); border-radius: 50%; background: none; color: var(--muted); font-family: Georgia, serif; font-size: 10px; font-weight: 700; line-height: 1; cursor: pointer; }
	.info:hover, .info[aria-expanded='true'] { border-color: var(--link); color: var(--link); }
	.info-text {
		position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%); width: min(240px, calc(100vw - 48px));
		padding: 10px 12px; border-radius: 12px; border: 1px solid var(--glass-edge);
		background: var(--glass-strong); backdrop-filter: blur(18px); box-shadow: 0 10px 28px #0b1a2a33;
		font-size: 12px; line-height: 1.4; color: var(--muted); text-align: center;
	}
	/* fixed size: the ring never grows or shrinks with the card */
	.ring-wrap { flex: none; width: 240px; height: 240px; padding: 10px; border-radius: 50%; background: var(--glass-strong); backdrop-filter: blur(18px); box-shadow: 0 0 0 1px var(--glass-edge), 0 14px 36px rgba(20, 45, 70, 0.14); }

	.eno {
		display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 10px 0 12px;
		border: 1px solid var(--glass-edge); border-radius: 999px; background: var(--glass); backdrop-filter: blur(18px);
		color: var(--dark, #b5b6ff) var(--light, #3c3fb0); font-size: 12.5px; font-weight: 700; text-decoration: none;
	}
	.eno small { font-size: 11.5px; font-weight: 600; color: var(--muted); }
	.eno:hover { background: var(--glass-strong); }

	.list { grid-area: list; padding: 14px 14px 10px; }
	.list-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
	.list-head h2 { font-size: 16px; font-weight: 750; letter-spacing: -0.02em; line-height: 1.2; }
	.list-head p { margin-top: 2px; font-size: 12.5px; color: var(--muted); }
	.green { display: grid; gap: 5px; margin-bottom: 8px; padding: 9px 10px; border-radius: 12px; background: var(--sunken); }
	.green-row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
	.green-row span { color: var(--muted); }
	.green-row b { font-weight: 650; }
	.green-track { height: 6px; border-radius: 999px; background: var(--border); overflow: hidden; }
	.green-fill { height: 100%; border-radius: 999px; background: var(--c); }
	.clear { flex: none; padding: 2px 0; border: 0; background: none; color: var(--link); font-size: 12.5px; font-weight: 650; cursor: pointer; }

	/* Clean list items: pastel tile, bold title, quiet detail — no dividers */
	/* room for four rows, so hovering between categories doesn't make the card jump */
	.items { display: grid; align-content: start; gap: 2px; min-height: 196px; margin: 0 -6px; }
	.item { display: flex; align-items: center; gap: 12px; padding: 7px 6px; border-radius: 14px; color: var(--ink); }
	.ptile {
		display: grid; place-items: center; flex: none; width: 34px; height: 34px; border-radius: 10px;
		background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c);
	}
	.item-text { flex: 1; display: grid; gap: 1px; min-width: 0; }
	.item-text strong { font-size: 14px; font-weight: 650; letter-spacing: -0.01em; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.item-text small { font-size: 12px; color: var(--muted); }
	.item-val { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.empty { padding: 10px 6px; color: var(--muted); font-size: 13px; }
	.cta { display: inline-flex; align-items: center; gap: 2px; margin-top: 6px; color: var(--link); font-size: 13px; font-weight: 650; text-decoration: none; }
	.cta:hover { text-decoration: underline; text-underline-offset: 3px; }

	.state { grid-area: state; display: grid; gap: 12px; place-content: center; justify-items: center; min-height: 360px; padding: 32px; color: var(--muted); }
	.solid { min-height: 36px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--link); color: #fff; font-weight: 700; cursor: pointer; }

	/* ---- Landscape (wide screens only): logo over footprint | chart | purchases ---- */
	@media (min-width: 700px) {
		.cw:has(.card.landscape) { padding-left: 12px; padding-right: 12px; }
		.card.landscape { width: min(960px, 100%); }
		/* side columns flex; the ring column stays its fixed size */
		.card.landscape .grid {
			grid-template-columns: minmax(130px, 210px) minmax(244px, 1fr) minmax(230px, 340px);
			grid-template-rows: auto 1fr;
			grid-template-areas: 'logo chart list' 'foot chart list' 'state state state';
			gap: 16px 12px;
			padding: 20px 14px;
			min-height: 440px;
		}
		.card.landscape .logo { width: min(140px, 100%); }
		.card.landscape .foot { align-self: end; margin-right: 0; min-width: 0; }
		.card.landscape .chart { align-self: center; }
		/* purchases run the full height of the right side, starting below the close button */
		.card.landscape .list { align-self: stretch; margin-top: 30px; display: flex; flex-direction: column; }
		.card.landscape .list .cta { margin-top: auto; }
	}
	/* Landscape needs the room, so the toggle only appears where it can take effect */
	@media (max-width: 699px) {
		.layout-toggle { display: none; }
	}

	@media (max-width: 480px) {
		.cw { padding: 0; place-items: stretch; }
		.card { width: 100%; min-height: 100dvh; border-radius: 0; }
		/* card fills the screen here, so sit beside the close button instead of on top of it */
		.page-controls { top: 12px; right: 46px; }
		.page-btn { width: 32px; height: 32px; }
		/* start below the page controls and close button, which share the top strip here */
		.grid { padding: 54px 12px 16px; }
		.logo { width: 124px; }
		.foot { margin-right: 0; min-width: 0; }
		.sun { width: 140vmax; margin-left: -70vmax; }
	}
</style>
