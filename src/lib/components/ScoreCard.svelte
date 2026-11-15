<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title, logoLight, logoDark, score, rating, scoreLabel, color, progress, description, note, href, linkLabel, onActivate
	}: {
		title: string;
		logoLight: string;
		logoDark: string;
		score: number | string;
		rating: string;
		scoreLabel: string;
		color: string;
		progress: number;
		description: Snippet;
		note?: string;
		href: string;
		linkLabel: string;
		onActivate?: () => void;
	} = $props();

	function activate(event: MouseEvent) {
		// Keep modifier/middle clicks (new tab, new window, download) on the plain
		// href fallback; only a plain primary click runs the in-app action.
		if (!onActivate) return;
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		if (event.defaultPrevented) return;
		event.preventDefault();
		onActivate();
	}
</script>

<article class="score-card">
	<div class="logo">
		<img class="logo-light" src={logoLight} alt={title} />
		<img class="logo-dark" src={logoDark} alt={title} />
	</div>
	<div class="gauge" role="img" aria-label={scoreLabel} style="--score-color: {color}; --score-progress: {progress}%">
		<div><strong>{score}</strong><small>{rating}</small></div>
	</div>
	<div>
		<p>{@render description()}</p>
		{#if note}<small class="muted">{note}</small>{/if}
	</div>
	<a href={href} onclick={activate}>
		{linkLabel}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
	</a>
</article>

<style>
	.score-card, .gauge { box-sizing: border-box; }
	.score-card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		padding: 17px;
		min-height: 172px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 16px;
		box-shadow: var(--shadow);
	}
	.logo {
		align-self: center;
		display: grid;
		width: min(100%, 108px);
		aspect-ratio: 1000 / 413;
	}
	.logo img {
		grid-area: 1 / 1;
		width: 100%;
		height: 100%;
		object-fit: contain;
		object-position: center;
	}
	.logo-light { display: var(--dark, none) var(--light, block); }
	.logo-dark { display: var(--dark, block) var(--light, none); }
	p { margin: 0; font-size: 14px; color: var(--muted); }
	.muted { color: var(--muted); }
	.gauge {
		align-self: center;
		flex: none;
		width: 78px;
		height: 78px;
		padding: 4px;
		border-radius: 50%;
		background: conic-gradient(from 225deg, var(--score-color) 0 var(--score-progress), var(--border) var(--score-progress) 75%, transparent 75%);
	}
	.gauge div {
		display: grid;
		width: 100%;
		height: 100%;
		place-content: center;
		text-align: center;
		border-radius: 50%;
		background: var(--surface);
	}
	.gauge strong { font-size: 24px; line-height: 1; }
	.gauge small { font-size: 10px; color: var(--muted); }
	a {
		margin-top: auto;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--link);
		font-size: 13px;
		font-weight: 650;
		text-decoration: none;
	}
	a:hover { text-decoration: underline; }
	a svg { flex: none; width: 15px; height: 15px; }
</style>
