<script lang="ts">
  import type { LocationEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';

  interface Props {
    card: LocationEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const hasCoords = $derived(
    typeof payload.lat === 'number' &&
      Number.isFinite(payload.lat) &&
      typeof payload.lng === 'number' &&
      Number.isFinite(payload.lng)
  );
  const mapSrc = $derived(
    hasCoords
      ? `/api/mapbox/static?lat=${payload.lat}&lng=${payload.lng}&zoom=15`
      : ''
  );
  const label = $derived(`ATM, ${payload.name}`);

  let mapFailed = $state(false);
</script>

<CardFrame {label}>
  <div class="atm-locator-card" data-kind="location">
    <div class="name">{payload.name}</div>
    {#if payload.hours}
      <div class="hours">{payload.hours}</div>
    {/if}
    {#if hasCoords && !mapFailed}
      <img
        class="atm-map"
        src={mapSrc}
        alt={`Map showing ${payload.name}`}
        loading="lazy"
        onerror={() => (mapFailed = true)}
      />
    {:else if hasCoords}
      <div class="map-fallback" role="status">Map preview unavailable</div>
    {/if}
  </div>
</CardFrame>

<style>
  .atm-locator-card {
    min-width: 0;
  }
  .name {
    font-size: 13.5px;
    font-weight: 650;
    line-height: 1.35;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .hours {
    margin-top: 6px;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .atm-map {
    display: block;
    width: 100%;
    height: 150px;
    margin-top: 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    object-fit: cover;
    background: color-mix(in srgb, var(--surface) 80%, var(--ink) 8%);
  }
  .map-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 72px;
    margin-top: 8px;
    border: 1px dashed var(--border);
    border-radius: 8px;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
  }
</style>
