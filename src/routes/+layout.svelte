<script lang="ts">
	import faviconLight from '$lib/assets/favicon-light.ico';
	import faviconDark from '$lib/assets/favicon-dark.ico';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={faviconLight} sizes="16x16 32x32 64x64" />
	<link rel="icon" href={faviconDark} sizes="16x16 32x32 64x64" media="(prefers-color-scheme: dark)" />
</svelte:head>

{@render children()}
