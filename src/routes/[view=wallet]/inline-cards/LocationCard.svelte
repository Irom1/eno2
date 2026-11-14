<script lang="ts">
  import type { LocationEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';

  interface Props {
    card: LocationEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const label = $derived(
    `Location, ${payload.name}${payload.address ? `, ${payload.address}` : ''}`
  );
</script>

<CardFrame {label}>
  <div class="location-card" data-kind="location">
    <div class="name">{payload.name}</div>
    {#if payload.address}
      <div class="address">{payload.address}</div>
    {/if}
    {#if payload.hours}
      <div class="hours">{payload.hours}</div>
    {/if}
  </div>
</CardFrame>

<style>
  .location-card {
    min-width: 0;
  }
  .name {
    font-size: 13.5px;
    font-weight: 650;
    line-height: 1.35;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .address {
    margin-top: 3px;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .hours {
    margin-top: 6px;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
</style>
