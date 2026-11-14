<script lang="ts">
  import type { LocationEntityCard } from '$lib/chat/entityCards.js';
  import { osmEmbedUrl, osmPageUrl } from '$lib/chat/osm.js';
  import CardFrame from './CardFrame.svelte';
  import OpenIcon from './OpenIcon.svelte';

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
  const embedSrc = $derived(lat !== null && lng !== null ? osmEmbedUrl(lat, lng) : null);
  const pageUrl = $derived(lat !== null && lng !== null ? osmPageUrl(lat, lng) : null);
  const distance = $derived(
    typeof payload.distanceMiles === 'number' && Number.isFinite(payload.distanceMiles)
      ? payload.distanceMiles
      : null
  );
  const label = $derived(`ATM, ${payload.name}`);
</script>

<CardFrame {label}>
  <div class="atm-locator-card" data-kind="location">
    <div class="name">{payload.name}</div>
    {#if distance !== null}
      <div class="distance">{distance.toFixed(1)} mi away</div>
    {/if}
    {#if payload.hours}
      <div class="hours">{payload.hours}</div>
    {/if}
    {#if embedSrc}
      <iframe
        class="atm-map"
        src={embedSrc}
        title={`Map showing ${payload.name}`}
        loading="lazy"
      ></iframe>
      {#if pageUrl}
        <a
          class="map-link"
          href={pageUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in OpenStreetMap
          <OpenIcon />
        </a>
      {/if}
    {:else}
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
  .map-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    color: var(--accent, #2f7d95);
    font-size: 11.5px;
    font-weight: 600;
    text-decoration: none;
  }
  .map-link:hover,
  .map-link:focus-visible {
    text-decoration: underline;
  }
  .map-link :global(.open-icon) {
    width: 12px;
    height: 12px;
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
