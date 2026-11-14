<script lang="ts">
  import { asItems } from '$lib/chat/cards.js';
  import ChatCardShell from './ChatCardShell.svelte';

  interface Props {
    payload: unknown;
  }

  let { payload }: Props = $props();

  const CAP = 6;
  const all = $derived(asItems(payload));
  const items = $derived(all.slice(0, CAP));
  const more = $derived(Math.max(0, all.length - CAP));

  function text(value: unknown): string {
    return value === undefined || value === null ? '' : String(value);
  }

  const scope = $derived.by(() => {
    const ids = all.map((location) => text(location._id).toLowerCase());
    if (ids.length === 0) return 'ATMs & branches';
    if (ids.every((id) => id.startsWith('atm'))) return 'ATMs';
    if (ids.every((id) => id.startsWith('branch'))) return 'Branches';
    if (ids.every((id) => id.startsWith('atm') || id.startsWith('branch'))) return 'Locations';
    return 'ATMs & branches';
  });

  function addressOf(location: Record<string, unknown>): string {
    const raw = location.address ?? location.physical_address;
    const address =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    return [address.street, address.city, address.state]
      .map((part) => text(part))
      .filter(Boolean)
      .join(', ');
  }

  function hoursOf(location: Record<string, unknown>): string {
    const value = text(location.hours);
    return value && value.toLowerCase() !== 'undefined' ? value : '';
  }
</script>

<ChatCardShell title={scope} badge={all.length ? `${all.length}` : undefined}>
  {#if items.length === 0}
    <p class="empty">No nearby locations found.</p>
  {:else}
    <ul class="rows">
      {#each items as location, index (text(location._id) || index)}
        <li class="row">
          <span class="row-main">
            <span class="name">{text(location.name) || 'Location'}</span>
            {#if addressOf(location)}<span class="meta">{addressOf(location)}</span>{/if}
            {#if hoursOf(location)}<span class="meta">{hoursOf(location)}</span>{/if}
          </span>
        </li>
      {/each}
    </ul>
    {#if more > 0}
      <p class="more">{more} more</p>
    {/if}
  {/if}
</ChatCardShell>

<style>
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    max-height: 250px;
    overflow-y: auto;
  }
  .row {
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
    min-width: 0;
  }
  .row:last-child {
    border-bottom: none;
  }
  .row-main {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    color: var(--muted);
    font-size: 11px;
    overflow-wrap: anywhere;
  }
  .more {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 11px;
  }
  .empty {
    margin: 0;
    color: var(--muted);
  }
</style>
