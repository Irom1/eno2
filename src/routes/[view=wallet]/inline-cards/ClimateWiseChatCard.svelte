<script lang="ts">
  import ClimateWisePage from '$lib/climate/ClimateWisePage.svelte';
  import type { ClimateWiseEntityCard } from '$lib/chat/entityCards.js';
  import { customerHref } from '$lib/customerSelection';

  let { card }: { card: ClimateWiseEntityCard } = $props();

  const report = $derived(card.payload.report);
  const customerId = $derived(card.payload.customerId ?? '');
  const backHref = $derived(customerHref('/dashboard', customerId));
</script>

<div class="climatewise-chat-card" data-kind="climatewise">
  <ClimateWisePage
    embedded
    reportOverride={report}
    customerId={customerId || null}
    {backHref}
  />
</div>

<style>
  .climatewise-chat-card {
    width: 88%;
    max-width: 88%;
    min-width: 0;
    align-self: flex-start;
  }
</style>
