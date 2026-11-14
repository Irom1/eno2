<script lang="ts">
  import { dateLabel, money, titleCase } from '$lib/format.js';
  import type { TransactionListEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';

  interface Props {
    card: TransactionListEntityCard;
  }

  let { card }: Props = $props();

  const rows = $derived(card.payload.rows);
  const more = $derived(card.payload.more);
  const label = $derived(
    `Transactions, ${rows.length} shown${more > 0 ? `, ${more} more` : ''}`
  );
</script>

<CardFrame {label}>
  <div class="transaction-list-card" data-kind="transaction-list">
    <ul class="rows">
      {#each rows as row (row.id)}
        {@const dateText = row.date ? dateLabel(row.date) : ''}
        {@const amountText = row.amount === null ? '' : money(row.amount, { decimals: 2 })}
        <li class="transaction-row">
          <div class="details">
            <span class="description">{row.description}</span>
            {#if dateText || row.status}
              <span class="meta">
                {#if dateText}{dateText}{/if}
                {#if dateText && row.status} · {/if}
                {#if row.status}{titleCase(row.status)}{/if}
              </span>
            {/if}
          </div>
          {#if amountText}
            <span class="amount">{amountText}</span>
          {/if}
        </li>
      {/each}
    </ul>
    {#if more > 0}
      <p class="more">{more} more</p>
    {/if}
  </div>
</CardFrame>

<style>
  .transaction-list-card {
    min-width: 0;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .transaction-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 0;
    min-width: 0;
  }
  .transaction-row:first-child {
    padding-top: 0;
  }
  .transaction-row:last-child {
    padding-bottom: 0;
  }
  .transaction-row + .transaction-row {
    border-top: 1px solid color-mix(in srgb, var(--ink) 10%, var(--border));
  }
  .details {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .description {
    font-size: 13.5px;
    font-weight: 650;
    line-height: 1.35;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .meta {
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
  }
  .amount {
    flex: none;
    font-size: 13.5px;
    font-weight: 700;
    line-height: 1.35;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .more {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
  }
</style>
