<script lang="ts">
  import type { LocationEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';

  interface Props {
    card: LocationEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const distance = $derived(
    typeof payload.distanceMiles === 'number' && Number.isFinite(payload.distanceMiles)
      ? payload.distanceMiles
      : null
  );
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
    {#if distance !== null}
      <div class="distance">{distance.toFixed(1)} mi away</div>
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
  .distance {
    margin-top: 4px;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
  }
  .hours {
    margin-top: 6px;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
</style>
