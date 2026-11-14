<script lang="ts">
  import { money } from '$lib/format.js';
  import { asItems, asRecord } from './cards.js';
  import ChatCardShell from './ChatCardShell.svelte';

  interface Props {
    payload: unknown;
  }

  let { payload }: Props = $props();

  const CAP = 6;
  const data = $derived(asRecord(payload));
  const rows = $derived(
    Array.isArray(data.recurringCharges)
      ? (data.recurringCharges as unknown[]).filter(
          (value): value is Record<string, unknown> =>
            Boolean(value) && typeof value === 'object' && !Array.isArray(value)
        )
      : asItems(payload)
  );
  const items = $derived(rows.slice(0, CAP));
  const more = $derived(Math.max(0, rows.length - CAP));

  function text(value: unknown): string {
    return value === undefined || value === null ? '' : String(value);
  }

  function num(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
</script>

<ChatCardShell title="Recurring payments">
  {#if items.length === 0}
    <p class="empty">No recurring payments found.</p>
  {:else}
    <ul class="rows">
      {#each items as charge, index (text(charge.description) || index)}
        <li class="row">
          <span class="row-main">
            <span class="name">{text(charge.description) || 'Recurring charge'}</span>
            <span class="meta">
              {num(charge.monthsSeen)} months{num(charge.occurrences) ? ` · ${num(charge.occurrences)} charges` : ''}
            </span>
          </span>
          <span class="amount">{money(charge.averageAmount, { decimals: 0 })}</span>
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
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
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
  }
  .amount {
    flex: none;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
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
