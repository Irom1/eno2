<script lang="ts">
  import ClimateWisePage from '$lib/climate/ClimateWisePage.svelte';
  import type { ClimateWiseEntityCard } from '$lib/chat/entityCards.js';
  import type { EnoVariant } from '$lib/eno.js';

  let {
    card,
    variant = 'light'
  }: { card: ClimateWiseEntityCard; variant?: EnoVariant } = $props();

  const report = $derived(card.payload.report);
  const customerId = $derived(card.payload.customerId ?? '');
</script>

<div class="climatewise-chat-card" data-kind="climatewise">
  <ClimateWisePage
    embedded
    reportOverride={report}
    customerId={customerId || null}
    theme={variant}
  />
</div>

<style>
  .climatewise-chat-card {
    width: 88%;
    max-width: 88%;
    min-width: 0;
    align-self: flex-start;
  }

  @media (max-width: 570px) {
    .climatewise-chat-card {
      width: 96%;
      max-width: 96%;
    }
  }
</style>
