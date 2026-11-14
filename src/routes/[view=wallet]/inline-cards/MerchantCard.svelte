<script lang="ts">
  import { titleCase } from '$lib/format.js';
  import type { MerchantEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';

  interface Props {
    card: MerchantEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const categoryText = $derived(payload.category ? titleCase(payload.category) : '');
  const label = $derived(
    `Merchant, ${payload.name}${categoryText ? `, ${categoryText}` : ''}`
  );
</script>

<CardFrame {label}>
  <div class="merchant-card" data-kind="merchant">
    <div class="name">{payload.name}</div>
    {#if categoryText}
      <div class="category">{categoryText}</div>
    {/if}
    {#if payload.address}
      <div class="address">{payload.address}</div>
    {/if}
  </div>
</CardFrame>

<style>
  .merchant-card {
    min-width: 0;
  }
  .name {
    font-size: 13.5px;
    font-weight: 650;
    line-height: 1.35;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .category {
    margin-top: 3px;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .address {
    margin-top: 3px;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
</style>
