<script lang="ts">
  import { onMount } from 'svelte';
  import { titleCase } from '$lib/format.js';
  import { GUEST_CUSTOMER_ID } from '$lib/chat/guest';
  import { prefetchTransactionContext } from '$lib/walletCache';
  import {
    transactionHref,
    type TransactionListEntityCard,
    type TransactionRow
  } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';
  import DateText from './primitives/DateText.svelte';
  import MoneyText from './primitives/MoneyText.svelte';
  import OpenIcon from './OpenIcon.svelte';
  import TruncationFooter from './primitives/TruncationFooter.svelte';

  interface Props {
    card: TransactionListEntityCard;
  }

  let { card }: Props = $props();

  const rows = $derived(card.payload.rows);
  const more = $derived(card.payload.more);
  const label = $derived(
    `Transactions, ${rows.length} shown${more > 0 ? `, ${more} more transactions` : ''}`
  );

  function hrefFor(row: TransactionRow): string | undefined {
    return transactionHref(row.customerId, row.accountId, row.id);
  }

  function warmRow(row: TransactionRow): void {
    if (!hrefFor(row) || row.customerId === GUEST_CUSTOMER_ID) return;
    void prefetchTransactionContext(row.customerId, row.accountId);
  }

  // Warm just the first row's account once. The cache dedupes repeated calls,
  // and this avoids fetching every account in the list.
  onMount(() => {
    const first = rows[0];
    if (first) warmRow(first);
  });
</script>

{#snippet content(row: TransactionRow, linked: boolean)}
  {@const hasDate = Boolean(row.date)}
  {@const hasKg = typeof row.kg === 'number' && Number.isFinite(row.kg)}
  <div class="details">
    <span class="description">{row.description}</span>
    {#if hasDate || row.status || hasKg}
      <span class="meta">
        {#if hasDate}<DateText value={row.date} />{/if}
        {#if hasDate && (row.status || hasKg)} · {/if}
        {#if row.status}{titleCase(row.status)}{/if}
        {#if row.status && hasKg} · {/if}
        {#if hasKg}{row.kg} kg CO₂e{/if}
      </span>
    {/if}
  </div>
  <span class="side">
    {#if row.amount !== null}
      <span class="amount"><MoneyText amount={row.amount} decimals={2} /></span>
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
              data-sveltekit-preload-data="hover"
              onpointerenter={() => warmRow(row)}
              onpointerdown={() => warmRow(row)}
              onfocus={() => warmRow(row)}
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
      <TruncationFooter {more} label="more transactions" />
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
</style>
