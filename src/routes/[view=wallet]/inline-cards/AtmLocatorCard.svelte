<script lang="ts">
  import type { LocationEntityCard } from '$lib/chat/entityCards.js';
  import { appleMapsUrl, googleMapsUrl } from '$lib/chat/maps.js';
  import CardFrame from './CardFrame.svelte';

  interface Props {
    card: LocationEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const lat = $derived(
    typeof payload.lat === 'number' && Number.isFinite(payload.lat) ? payload.lat : null
  );
  const lng = $derived(
    typeof payload.lng === 'number' && Number.isFinite(payload.lng) ? payload.lng : null
  );
  const hasCoords = $derived(lat !== null && lng !== null);
  const mapSrc = $derived(
    hasCoords ? `/api/mapbox/static?lat=${lat}&lng=${lng}&zoom=15` : null
  );
  let mapFailed = $state(false);
  const appleUrl = $derived(lat !== null && lng !== null ? appleMapsUrl(lat, lng, payload.name) : null);
  const googleUrl = $derived(
    lat !== null && lng !== null ? googleMapsUrl(lat, lng, payload.name) : null
  );
  const distance = $derived(
    typeof payload.distanceMiles === 'number' && Number.isFinite(payload.distanceMiles)
      ? payload.distanceMiles
      : null
  );
  const label = $derived(`ATM, ${payload.name}`);
</script>

<!--
  The ATM locator is a standalone card (not inside the prose bubble). The map
  card holds only the primitive data plus the Mapbox preview; the Apple/Google
  actions sit below the card, outside both the card and the bubble.
-->
<div class="atm-locator">
  <CardFrame {label}>
    <div class="atm-locator-card" data-kind="location">
      <div class="name">{payload.name}</div>
      {#if distance !== null}
        <div class="distance">{distance.toFixed(1)} mi away</div>
      {/if}
      {#if payload.hours}
        <div class="hours">{payload.hours}</div>
      {/if}
      {#if mapSrc && !mapFailed}
        <img
          class="atm-map"
          src={mapSrc}
          alt={`Map showing ${payload.name}`}
          loading="lazy"
          onerror={() => (mapFailed = true)}
        />
      {:else}
        <div class="map-fallback" role="status">Map preview unavailable</div>
      {/if}
    </div>
  </CardFrame>
  {#if appleUrl || googleUrl}
    <div class="atm-actions">
      {#if appleUrl}
        <a
          class="atm-action"
          href={appleUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Apple Maps
        </a>
      {/if}
      {#if googleUrl}
        <a
          class="atm-action"
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Google Maps
        </a>
      {/if}
    </div>
  {/if}
</div>

<style>
  .atm-locator {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
    min-width: 0;
  }
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
  .atm-map {
    display: block;
    width: 100%;
    height: 150px;
    margin-top: 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface) 80%, var(--ink) 8%);
  }
  /* Matches the CardFrame max width in .assistant-content: two equal columns. */
  .atm-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    width: 88%;
    max-width: 88%;
  }
  .atm-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 44px;
    padding: 10px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink);
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    text-decoration: none;
    overflow-wrap: anywhere;
    box-sizing: border-box;
    transition: background-color 160ms ease, border-color 160ms ease,
      color 160ms ease, box-shadow 160ms ease;
  }
  .atm-action:only-child {
    grid-column: 1 / -1;
  }
  .atm-action:hover,
  .atm-action:focus-visible {
    background: color-mix(in srgb, var(--link) 14%, var(--surface));
    border-color: color-mix(in srgb, var(--link) 55%, var(--border));
    color: var(--link);
    text-decoration: none;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--link) 16%, transparent);
  }
  .atm-action:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 1px;
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
