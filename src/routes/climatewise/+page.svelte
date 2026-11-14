<script lang="ts">
	import { page } from '$app/state';
	import { customerHref } from '$lib/customerSelection';
	import ClimateWisePage from '$lib/climate/ClimateWisePage.svelte';

	let customerId = $derived(page.url.searchParams.get('customer'));
	let dashboardHref = $derived(customerHref('/dashboard', customerId));
</script>

<svelte:head><title>ClimateWise | Eno</title></svelte:head>

<ClimateWisePage {customerId} backHref={dashboardHref} />
