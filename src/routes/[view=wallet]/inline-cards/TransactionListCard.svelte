<script lang="ts">
  import { dateLabel, money, titleCase } from '$lib/format.js';
  import {
    transactionHref,
    type TransactionListEntityCard,
    type TransactionRow
  } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';
  import OpenIcon from './OpenIcon.svelte';

  interface Props {
    card: TransactionListEntityCard;
  }

  let { card }: Props = $props();

  const rows = $derived(card.payload.rows);
  const more = $derived(card.payload.more);
  const label = $derived(
    `Transactions, ${rows.length} shown${more > 0 ? `, ${more} more` : ''}`
  );

  function hrefFor(row: TransactionRow): string | undefined {
    return transactionHref(row.customerId, row.accountId, row.id);
  }
</script>

{#snippet content(row: TransactionRow, linked: boolean)}
  {@const dateText = row.date ? dateLabel(row.date) : ''}
  {@const amountText = row.amount === null ? '' : money(row.amount, { decimals: 2 })}
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
  <span class="side">
    {#if amountText}
      <span class="amount">{amountText}</span>
    {/if}
    {#if linked}
      <OpenIcon />
    {/if}
  </span>
{/snippet}

<CardFrame {label}>
  <div class="transaction-list-card" data-kind="transaction-list">
    <ul class="rows">
      {#each rows as row (row.id)}
        {@const href = hrefFor(row)}
        <li class="transaction-row">
          {#if href}
            <a
              class="transaction-link"
              {href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${row.description} in your account`}
            >
              {@render content(row, true)}
            </a>
          {:else}
            <div class="transaction-link">
              {@render content(row, false)}
            </div>
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
  .transaction-link {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    color: inherit;
    text-decoration: none;
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
    transition: color 140ms ease;
  }
  a.transaction-link:hover .description,
  a.transaction-link:focus-visible .description {
    color: var(--link);
  }
  .meta {
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
  }
  .side {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
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
