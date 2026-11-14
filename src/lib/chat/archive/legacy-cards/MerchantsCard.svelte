<script lang="ts">
  import { titleCase } from '$lib/format.js';
  import { asItems } from './cards.js';
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

  function addressOf(merchant: Record<string, unknown>): string {
    const raw = merchant.address;
    const address =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    return [address.street, address.city, address.state]
      .map((part) => text(part))
      .filter(Boolean)
      .join(', ');
  }
</script>

<ChatCardShell title="Merchants">
  {#if items.length === 0}
    <p class="empty">No merchants to show.</p>
  {:else}
    <ul class="rows">
      {#each items as merchant, index (text(merchant._id) || index)}
        <li class="row">
          <span class="row-main">
            <span class="name">{text(merchant.name) || 'Merchant'}</span>
            {#if text(merchant.category)}<span class="meta">{titleCase(text(merchant.category))}</span>{/if}
            {#if addressOf(merchant)}<span class="meta">{addressOf(merchant)}</span>{/if}
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
    max-height: 240px;
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
