<script lang="ts">
	import RingChart, { type RingItem } from './RingChart.svelte';
	import CategoryIcon from './CategoryIcon.svelte';
	import logoLight from '$lib/assets/climatewise-logo-light.png';
	import logoDark from '$lib/assets/climatewise-logo-dark.png';
	import { CATEGORIES, CATEGORY_BY_ID, type ClimateReport } from './emissions';

	type Theme = 'light' | 'dark' | 'system';

	let {
		backHref = '/dashboard',
		enoHref = (prompt: string) => `/dashboard?ask=${encodeURIComponent(prompt)}`,
		theme = $bindable<Theme>(readTheme())
	}: {
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

	const DAYS = 90;
	let attempt = $state(0);
	let report = $state<ClimateReport | null>(null);
	let customer = $state<{ firstName: string; lastName: string } | null>(null);
	let error = $state('');
	let selected = $state<string | null>(null);
	let showInfo = $state(false);

	$effect(() => {
		attempt;
		let cancelled = false;
		error = '';
		fetch(`/api/climate?days=${DAYS}`)
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error('Request failed'))))
			.then((data) => {
				if (cancelled) return;
				report = data.report;
				customer = data.customer;
			})
			.catch(() => !cancelled && (error = 'We couldn’t load your ClimateWise report.'));
		return () => (cancelled = true);
	});

	// Theme-aware category colors, from the single source in emissions.ts
	const colorVars = CATEGORIES.map((c) => `--cat-${c.id}: var(--dark, ${c.colorDark}) var(--light, ${c.color})`).join(';');

	const kg = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}` : `${Math.round(n)}`);
	const kgUnit = (n: number) => (n >= 1000 ? 't' : 'kg');
	const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
	const niceDate = (iso: string) =>
		new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

	let ringItems = $derived.by((): RingItem[] => {
		if (!report) return [];
		return report.categories
			.filter((c) => c.kg > 0)
			.map((c) => ({
				id: c.id,
				label: c.label,
				share: c.share,
				fill: c.greenness,
				color: `var(--cat-${c.id})`,
				detail: `${Math.round(c.kg)} kg CO₂e · ${money(c.spend)}`
			}));
	});

	const titleCase = (t: string) =>
		t.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\.Com\b/, '.com');

	// Hub layout: SVG connectors from the ring out to each box.
	let hubEl = $state<HTMLElement | null>(null);
	let ringEl = $state<HTMLElement | null>(null);
	let boxEls = $state<(HTMLElement | null)[]>([null, null, null]);
	let links = $state<{ d: string; x: number; y: number; sx: number; sy: number }[]>([]);

	function layoutLinks() {
		if (!hubEl || !ringEl) return (links = []);
		const hub = hubEl.getBoundingClientRect();
		const ring = ringEl.getBoundingClientRect();
		const cx = ring.left + ring.width / 2 - hub.left;
		const cy = ring.top + ring.height / 2 - hub.top;
		const r = ring.width / 2 + 10;
		links = boxEls.filter(Boolean).map((el) => {
			const b = el!.getBoundingClientRect();
			// branch down from the ring to the top-center of each tile
			const x = b.left + b.width / 2 - hub.left;
			const y = b.top - hub.top;
			const ang = Math.atan2(y - cy, x - cx);
			const sx = cx + r * Math.cos(ang);
			const sy = cy + r * Math.sin(ang);
			const my = (sy + y) / 2;
			return { d: `M${sx} ${sy}C${sx} ${my} ${x} ${my} ${x} ${y}`, x, y, sx, sy };
		});
	}

	$effect(() => {
		if (!hubEl) return;
		report; showInfo; // re-measure when content changes
		const ro = new ResizeObserver(() => layoutLinks());
		ro.observe(hubEl);
		requestAnimationFrame(layoutLinks);
		return () => ro.disconnect();
	});

	let compareMax = $derived(report ? Math.max(report.benchmarkTonnes, report.annualizedTonnes) * 1.08 : 1);
	let visiblePurchases = $derived.by(() => {
		if (!report) return [];
		if (!selected) return report.topPurchases;
		return report.topPurchases.filter((p) => p.category === selected);
	});
	let selectedLabel = $derived(selected ? CATEGORY_BY_ID[selected as keyof typeof CATEGORY_BY_ID]?.label : '');

</script>

<div class="cw" data-theme={theme} style={colorVars}>
	<!-- Page-level control, off the card, matching the dashboard's toggle -->
	<button class="theme-toggle" onclick={toggleTheme} aria-pressed={isDark}
		aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
		<CategoryIcon id={isDark ? 'sun' : 'moon'} size={18} />
	</button>
	<article class="card" aria-labelledby="cw-title">
		<div class="sky" aria-hidden="true">
			<div class="sky-day"></div>
			<div class="sky-night"></div>
			<div class="sun"><span class="sun-day"></span><span class="sun-dusk"></span></div>
		</div>

		<!-- Seamless top: close button in the corner, brand centered -->
		<div class="corner right">
			<a class="icon-btn" href={backHref} aria-label="Close and go back to dashboard" title="Close">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
			</a>
		</div>
		<header class="brand">
			<!-- Both logo colorways stacked; the theme crossfades between them -->
			<h1 id="cw-title" class="logo">
				<img class="logo-light" src={logoLight} alt="ClimateWise" width="1000" height="392" />
				<img class="logo-dark" src={logoDark} alt="" aria-hidden="true" width="1000" height="392" />
			</h1>
		</header>

		{#if error}
			<div class="state"><p>{error}</p><button class="solid" onclick={() => attempt++}>Try again</button></div>
		{:else if !report}
			<div class="state" aria-busy="true"><p>Loading your report…</p></div>
		{:else}
			<div class="hub" bind:this={hubEl}>
				<svg class="links" aria-hidden="true">
					{#each links as l}
						<path d={l.d} />
						<circle cx={l.sx} cy={l.sy} r="3" />
						<circle cx={l.x} cy={l.y} r="3" />
					{/each}
				</svg>

				<!-- Ring -->
				<div class="chart-head">
					<h2 class="chart-title">Carbon emissions by category</h2>
					<button class="info" aria-expanded={showInfo} aria-controls="score-info" aria-label="How your score is estimated"
						onclick={() => (showInfo = !showInfo)}>i</button>
					{#if showInfo}
						<p class="info-text" id="score-info">ClimateWise score estimated from purchases over the past {report.days} days.</p>
					{/if}
				</div>

				<div class="ring-wrap" bind:this={ringEl}>
					<RingChart
						items={ringItems}
						bind:selected
						size={220}
						ariaLabel="Carbon emissions by purchase category"
						centerValue={String(report.score)}
						centerUnit={report.tier}
					/>
				</div>

				<!-- Three tiles; hover / tap for details -->
				<div class="tiles">
					<div class="tile-wrap">
						<button class="tile" bind:this={boxEls[0]} aria-describedby="pop-foot">
							<span class="tile-icon t-green"><CategoryIcon id="leaf" size={15} /></span>
							<span class="tile-label">Footprint</span>
							<span class="tile-value">{kg(report.totalKg)}<small>{kgUnit(report.totalKg)}</small></span>
							<span class="tile-sub">CO₂e · {report.days}d</span>
						</button>
						<div class="pop" id="pop-foot" role="tooltip">
							<p class="pop-title">Your footprint</p>
							<p class="pop-sub">Estimated from {report.purchaseCount} purchases in the last {report.days} days.</p>
							<dl class="kv">
								<div><dt>Total</dt><dd>{kg(report.totalKg)} {kgUnit(report.totalKg)}</dd></div>
								<div><dt>Yearly pace</dt><dd>{report.annualizedTonnes} t</dd></div>
								<div><dt>Green spend</dt><dd>{Math.round(report.greenness.greenShare * 100)}%</dd></div>
							</dl>
							<div class="meters">
								{#each [
									{ l: 'You', t: report.annualizedTonnes, c: 'you' },
									{ l: 'US average', t: report.benchmarkTonnes, c: 'avg' },
									{ l: '2030 target', t: report.targetTonnes, c: 'goal' }
								] as m}
									<div class="meter">
										<span>{m.l}</span>
										<div class="track"><div class="fill {m.c}" style="width:{(m.t / compareMax) * 100}%"></div></div>
										<b>{m.t} t</b>
									</div>
								{/each}
							</div>
							<p class="pop-note">About the same as driving {report.equivalents.milesDriven.toLocaleString()} miles.</p>
						</div>
					</div>

					<div class="tile-wrap">
						<button class="tile" bind:this={boxEls[1]} aria-describedby="pop-eno">
							<span class="tile-icon t-indigo"><CategoryIcon id="sparkle" size={15} /></span>
							<span class="tile-label">Eno ideas</span>
							<span class="tile-value">−{report.nudges.reduce((s, n) => s + n.savingKgPerMonth, 0)}<small>kg</small></span>
							<span class="tile-sub">CO₂e per month</span>
						</button>
						<div class="pop" id="pop-eno" role="tooltip">
							<p class="pop-title">Eno’s suggestions</p>
							<p class="pop-sub">Small swaps with the biggest payoff for you.</p>
							<div class="items">
								{#each report.nudges as n (n.category)}
									<a class="item link" href={enoHref(n.prompt)}>
										<span class="ptile" style="--c:var(--cat-{n.category})"><CategoryIcon id={n.category} size={16} /></span>
										<span class="item-text">
											<strong>{n.title}</strong>
											<small>Saves about {n.savingKgPerMonth} kg CO₂e a month</small>
										</span>
										<span class="arrow" aria-hidden="true"><CategoryIcon id="arrow" size={14} /></span>
									</a>
								{/each}
							</div>
						</div>
					</div>

					<div class="tile-wrap">
						<button class="tile" bind:this={boxEls[2]} aria-describedby="pop-buy">
							<span class="tile-icon t-amber"><CategoryIcon id="receipt" size={15} /></span>
							<span class="tile-label">Top purchase</span>
							<span class="tile-value">{visiblePurchases[0] ? Math.round(visiblePurchases[0].kg) : 0}<small>kg</small></span>
							<span class="tile-sub">{visiblePurchases[0] ? titleCase(visiblePurchases[0].description) : '—'}</span>
						</button>
						<div class="pop" id="pop-buy" role="tooltip">
							<p class="pop-title">Highest-impact purchases</p>
							<p class="pop-sub">{selectedLabel ? `Filtered to ${selectedLabel}.` : 'The purchases that added the most CO₂e.'}</p>
							<div class="items">
								{#each visiblePurchases.slice(0, 4) as p (p.id)}
									<div class="item">
										<span class="ptile" style="--c:var(--cat-{p.category})"><CategoryIcon id={p.category} size={16} /></span>
										<span class="item-text">
											<strong>{titleCase(p.description)}</strong>
											<small>{niceDate(p.date)} · {money(p.amount)}</small>
										</span>
										<span class="item-val">{Math.round(p.kg)} kg</span>
									</div>
								{:else}
									<p class="empty">None in this group.</p>
								{/each}
							</div>
							<a class="cta" href={backHref}>View all activity <CategoryIcon id="chevron" size={14} /></a>
						</div>
					</div>
				</div>
			</div>

		{/if}
	</article>
</div>

<style>
	/* Same --dark / --light switch the dashboard uses. */
	.cw {
		--dark: ;
		--light: initial;
		--page: var(--dark, #060c13) var(--light, #eef2f6);
		--glass: var(--dark, rgba(10, 22, 40, 0.55)) var(--light, rgba(255, 255, 255, 0.62));
		--glass-strong: var(--dark, rgba(16, 30, 44, 0.78)) var(--light, rgba(255, 255, 255, 0.85));
		--glass-edge: var(--dark, rgba(255, 255, 255, 0.08)) var(--light, rgba(255, 255, 255, 0.75));
		--surface: var(--dark, #13232f) var(--light, #ffffff);
		--sunken: var(--dark, rgba(255, 255, 255, 0.05)) var(--light, rgba(16, 39, 58, 0.04));
		--ink: var(--dark, #eef4f8) var(--light, #10273a);
		--muted: var(--dark, #a3b6c4) var(--light, #5a6b79);
		--border: var(--dark, rgba(255, 255, 255, 0.1)) var(--light, rgba(16, 39, 58, 0.1));
		--line: var(--dark, rgba(190, 215, 235, 0.32)) var(--light, rgba(16, 39, 58, 0.28));
		--track: var(--dark, rgba(255, 255, 255, 0.1)) var(--light, rgba(16, 39, 58, 0.08));
		--link: var(--dark, #7cc8f2) var(--light, #0276b1);
		--navy: var(--dark, #0d2b40) var(--light, #013d5b);
		--accent: var(--dark, #4fc08a) var(--light, #12806a);
		--leaf: var(--dark, #59c26f) var(--light, #3aa548);
		color-scheme: var(--dark, dark) var(--light, light);
		box-sizing: border-box;
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 16px;
		background: var(--page);
		color: var(--ink);
		font: 15px/1.4 Inter, system-ui, sans-serif;
	}
	.cw[data-theme='dark'] { --dark: initial; --light: ; }
	@media (prefers-color-scheme: dark) { .cw[data-theme='system'] { --dark: initial; --light: ; } }
	.cw :global(*), .cw :global(*::before), .cw :global(*::after) { box-sizing: border-box; }
	h1, p { margin: 0; }
	button { font: inherit; }

	.card {
		position: relative;
		isolation: isolate;
		display: flex;
		flex-direction: column;
		width: min(440px, 100%);
		border-radius: 26px;
		box-shadow: 0 1px 2px #0000000f, 0 20px 50px #0b1a2a2e;
		overflow: hidden;
	}
	.card > :not(.sky) { position: relative; z-index: 1; }

	/* Sky: day gradient in light mode; in dark mode the sun sets and the sky fades to dusk */
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
		/* near-black top easing into deep navy, with a faint teal/ember glow low down */
		background:
			linear-gradient(180deg, #03060c 0%, #050b18 38%, rgba(5, 11, 24, 0) 72%),
			radial-gradient(110% 60% at 100% 80%, rgba(11, 80, 72, 0.55) 0%, rgba(11, 80, 72, 0) 70%),
			radial-gradient(130% 70% at 15% 112%, rgba(150, 62, 18, 0.5) 0%, rgba(150, 62, 18, 0) 70%),
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
	.sun-dusk { background: radial-gradient(circle, rgba(255, 140, 50, 0.75) 0%, rgba(240, 90, 40, 0.3) 24%, transparent 55%); opacity: var(--dark, 1) var(--light, 0); }
	/* Seamless top */
	.corner { position: absolute !important; top: 14px; z-index: 6 !important; display: flex; align-items: center; gap: 2px; }
	.corner.right { right: 12px; }
	.theme-toggle {
		position: fixed; top: 16px; right: 16px; z-index: 10;
		display: grid; place-items: center; width: 42px; height: 42px; padding: 0;
		border: 1px solid var(--border); border-radius: 50%; background: var(--page); color: var(--ink); cursor: pointer;
	}
	.theme-toggle:hover { background: var(--surface); }
	.icon-btn { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border: 0; border-radius: 50%; background: none; color: var(--muted); cursor: pointer; }
	.icon-btn:hover { background: var(--sunken); color: var(--ink); }
	.brand { display: grid; justify-items: center; gap: 2px; padding: 22px 16px 0; text-align: center; }
	.logo { display: grid; width: 168px; margin: 4px 0 6px; }
	.logo img { grid-area: 1 / 1; width: 100%; height: auto; }
	.logo-light { opacity: var(--dark, 0) var(--light, 1); }
	.logo-dark { opacity: var(--dark, 1) var(--light, 0); }

	/* Hub: ring on top, three tiles branching below */
	.hub { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 12px 14px 18px; }
	.links { position: absolute; inset: 0; z-index: 3; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
	.links path { fill: none; stroke: var(--line); stroke-width: 1.5; stroke-dasharray: 2 5; stroke-linecap: round; }
	.links circle { fill: var(--line); }

	.chart-head { position: relative; z-index: 4; display: flex; align-items: center; gap: 6px; }
	.chart-title { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; color: var(--ink); }
	.info { width: 17px; height: 17px; padding: 0; border: 1.3px solid var(--muted); border-radius: 50%; background: none; color: var(--muted); font-family: Georgia, serif; font-size: 10px; font-weight: 700; line-height: 1; cursor: pointer; }
	.info:hover, .info[aria-expanded='true'] { border-color: var(--link); color: var(--link); }
	.info-text {
		position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%); width: min(240px, calc(100vw - 48px));
		padding: 10px 12px; border-radius: 12px; border: 1px solid var(--glass-edge);
		background: var(--glass-strong); backdrop-filter: blur(18px); box-shadow: 0 10px 28px #0b1a2a33;
		font-size: 12px; line-height: 1.4; color: var(--muted); text-align: center;
	}

	.ring-wrap { position: relative; z-index: 1; width: min(70vw, 270px, 32vh); min-width: 170px; margin-bottom: 26px; padding: 10px; border-radius: 50%; background: var(--glass-strong); backdrop-filter: blur(18px); box-shadow: 0 0 0 1px var(--glass-edge), 0 14px 36px rgba(20, 45, 70, 0.14); }
	.ring-wrap :global(.ring) { width: 100% !important; }

	/* Tiles */
	.tiles { position: relative; z-index: auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; }
	.tile-wrap { position: static; }
	.tile {
		display: grid; justify-items: start; gap: 1px; width: 100%; height: 100%; padding: 10px 10px 11px;
		border: 1px solid var(--glass-edge); border-radius: 16px; background: var(--glass); backdrop-filter: blur(18px) saturate(1.2);
		box-shadow: 0 8px 22px rgba(20, 45, 70, 0.1); color: var(--ink); text-align: left; cursor: pointer;
		transition: transform 0.15s, box-shadow 0.15s;
	}
	.tile-wrap:hover .tile, .tile:focus-visible, .tile-wrap:focus-within .tile { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(20, 45, 70, 0.16); }
	.tile-icon { display: grid; place-items: center; width: 26px; height: 26px; margin-bottom: 4px; border-radius: 8px; }
	.tile-label { font-size: 11.5px; font-weight: 650; color: var(--muted); }
	.tile-value { font-size: 22px; font-weight: 750; letter-spacing: -0.03em; line-height: 1.1; font-variant-numeric: tabular-nums; }
	.tile-value small { margin-left: 2px; font-size: 12px; font-weight: 600; letter-spacing: 0; color: var(--muted); }
	.tile-sub { max-width: 100%; font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.t-green { background: var(--dark, rgba(89, 194, 111, 0.2)) var(--light, #dcf3dc); color: var(--dark, #8fe0a0) var(--light, #2a7a3a); }
	.t-indigo { background: var(--dark, rgba(130, 130, 240, 0.22)) var(--light, #e2e3fb); color: var(--dark, #b5b6ff) var(--light, #3c3fb0); }
	.t-amber { background: var(--dark, rgba(240, 180, 60, 0.2)) var(--light, #fcebc8); color: var(--dark, #f5cf7a) var(--light, #9a6200); }

	/* Hover / tap detail panel: opens above the tiles, over the ring */
	.pop {
		position: absolute; left: 0; right: 0; bottom: calc(100% + 10px); z-index: 5;
		padding: 18px 18px 14px; border-radius: 22px; border: 1px solid var(--glass-edge);
		background: var(--dark, rgba(16, 28, 44, 0.9)) var(--light, rgba(255, 255, 255, 0.9));
		backdrop-filter: blur(24px) saturate(1.3);
		box-shadow: 0 1px 2px rgba(10, 25, 40, 0.05), 0 16px 40px rgba(10, 25, 40, 0.14);
		opacity: 0; visibility: hidden; transform: translateY(6px);
		transition: opacity 0.16s, transform 0.16s, visibility 0s 0.16s;
	}
	.pop::after { content: ''; position: absolute; left: 0; right: 0; top: 100%; height: 14px; } /* hover bridge */
	.tile-wrap:hover .pop, .tile-wrap:focus-within .pop { opacity: 1; visibility: visible; transform: none; transition: opacity 0.16s, transform 0.16s; }
	.pop-title { font-size: 18px; font-weight: 750; letter-spacing: -0.02em; line-height: 1.2; }
	.pop-sub { margin: 3px 0 14px; font-size: 13px; color: var(--muted); }
	.pop-note { margin-top: 14px; font-size: 13px; color: var(--muted); }

	.kv { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0 0 16px; }
	.kv div { padding: 10px 12px; border-radius: 14px; background: var(--sunken); }
	.kv dt { font-size: 11.5px; color: var(--muted); }
	.kv dd { margin: 2px 0 0; font-size: 18px; font-weight: 750; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
	.meters { display: grid; gap: 7px; }
	.meter { display: grid; grid-template-columns: 76px 1fr 40px; align-items: center; gap: 8px; font-size: 12.5px; }
	.meter span { color: var(--muted); }
	.meter b { text-align: right; font-variant-numeric: tabular-nums; }
	.track { height: 7px; border-radius: 999px; background: var(--track); overflow: hidden; }
	.fill { height: 100%; border-radius: 999px; }
	.fill.you { background: var(--leaf); }
	.fill.avg { background: var(--dark, #3b86c4) var(--light, #0a4f7f); }
	.fill.goal { background: #ffbe1a; }


	/* Clean list items: pastel tile, bold title, quiet detail — no dividers */
	.items { display: grid; gap: 2px; margin: 0 -8px; }
	.item { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 14px; color: var(--ink); text-decoration: none; }
	.item.link { transition: background 0.15s; }
	.item.link:hover { background: var(--sunken); }
	.ptile {
		display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 11px;
		background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c);
	}
	.item-text { flex: 1; display: grid; gap: 1px; min-width: 0; }
	.item-text strong { font-size: 14px; font-weight: 650; letter-spacing: -0.01em; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.item-text small { font-size: 12.5px; color: var(--muted); }
	.item.link .item-text strong { white-space: normal; }
	.item-val { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.arrow { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 50%; color: var(--muted); transition: background 0.15s, color 0.15s; }
	.item.link:hover .arrow { background: var(--surface); color: var(--ink); }
	.empty { padding: 10px 8px; color: var(--muted); font-size: 13px; }
	.cta { display: inline-flex; align-items: center; gap: 2px; margin-top: 10px; color: var(--link); font-size: 13.5px; font-weight: 650; text-decoration: none; }
	.cta:hover { text-decoration: underline; text-underline-offset: 3px; }


	.state { display: grid; gap: 12px; place-content: center; justify-items: center; min-height: 420px; padding: 32px; color: var(--muted); }
	.solid { min-height: 36px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--link); color: #fff; font-weight: 700; cursor: pointer; }

	@media (max-width: 480px) {
		.cw { padding: 0; place-items: stretch; }
		.card { width: 100%; min-height: 100dvh; border-radius: 0; }
		/* card fills the screen here, so sit beside the close button instead of on top of it */
		.theme-toggle { top: 12px; right: 46px; width: 32px; height: 32px; }
		.hub { flex: 1; justify-content: center; }
		.sun { width: 140vmax; margin-left: -70vmax; }
	}
	@media (prefers-reduced-motion: reduce) { .pop, .tile { transition: none; } }
</style>
