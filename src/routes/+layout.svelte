<script lang="ts">
	import faviconLight from '$lib/assets/favicon-light.ico';
	import faviconDark from '$lib/assets/favicon-dark.ico';
	import type { LayoutProps } from './$types';
	import { onNavigate } from '$app/navigation';
	import { tick } from 'svelte';

	let { children }: LayoutProps = $props();

	onNavigate((navigation) => {
		if (navigation.from?.url.pathname !== '/' || navigation.to?.url.pathname !== '/setup'
			|| navigation.to.url.searchParams.get('start') !== 'signup'
			|| !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		const root = document.documentElement;
		root.classList.add('opening-setup');
		return new Promise<void>((resolve) => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
				// Capture the sent prompt after the signup component has mounted.
				await tick();
			});
			void transition.finished.catch(() => undefined).finally(() => {
				root.classList.remove('opening-setup');
			});
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={faviconLight} sizes="16x16 32x32 64x64" />
	<link rel="icon" href={faviconDark} sizes="16x16 32x32 64x64" media="(prefers-color-scheme: dark)" />
</svelte:head>

{@render children()}

<style>
	:global(html.opening-setup .account-link),
	:global(html.opening-setup .first-account-message) { view-transition-name: first-account-message; }
	:global(html.opening-setup::view-transition-group(first-account-message)) {
		z-index: 1;
		animation-duration: 820ms;
		animation-timing-function: cubic-bezier(.22, 1, .36, 1);
	}
	:global(html.opening-setup::view-transition-old(first-account-message)),
	:global(html.opening-setup::view-transition-new(first-account-message)) {
		height: 100%;
		animation-duration: 820ms;
		animation-timing-function: cubic-bezier(.22, 1, .36, 1);
	}
	:global(html.opening-setup::view-transition-group(root)) { animation-duration: 420ms; }
	:global(html.opening-setup::view-transition-old(root)) { animation: none; }
	:global(html.opening-setup::view-transition-new(root)) {
		mix-blend-mode: normal;
		animation: setup-enter 420ms ease-out both;
	}
	@keyframes -global-setup-enter {
		from { opacity: 0; }
		to { opacity: 1; }
	}
</style>
