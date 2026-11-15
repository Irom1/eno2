<script lang="ts">
  import { onMount } from 'svelte';
  import { GUEST_CUSTOMER_ID } from '$lib/chat/guest';
  import { prefetchTransactionContext } from '$lib/walletCache';
  import { prefetchOnApproach } from '$lib/prefetchOnApproach';
  import {
    billHref,
    type BillListEntityCard,
    type BillListRow
  } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';
  import DateText from './primitives/DateText.svelte';
  import MoneyText from './primitives/MoneyText.svelte';
  import OpenIcon from './OpenIcon.svelte';
  import StatusChip from './StatusChip.svelte';
  import TruncationFooter from './primitives/TruncationFooter.svelte';

  interface Props {
    card: BillListEntityCard;
  }

  let { card }: Props = $props();

  const rows = $derived(card.payload.rows);
  const more = $derived(card.payload.more);
  const label = $derived(
    `Bills due, ${rows.length} shown${more > 0 ? `, ${more} more bills` : ''}`
  );

  function hrefFor(row: BillListRow): string | undefined {
    return billHref(row.customerId, row.accountId, row.id);
  }

  function warmRow(row: BillListRow): void {
    if (!hrefFor(row) || !row.customerId || row.customerId === GUEST_CUSTOMER_ID) return;
    void prefetchTransactionContext(row.customerId, row.accountId);
  }

  // Warm just the first row's account once. The cache dedupes repeated calls,
  // and this avoids fetching every account in the list.
  onMount(() => {
    const first = rows[0];
    if (first) warmRow(first);
  });
</script>

{#snippet content(row: BillListRow, linked: boolean)}
  <div class="details">
    <div class="head">
      <span class="payee">{row.payee}</span>
      {#if row.status}
        <StatusChip status={row.status} />
      {/if}
    </div>
    {#if row.dueDate}
      <span class="meta">Due <DateText value={row.dueDate} /></span>
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
  <div class="bill-list-card" data-kind="bill-list">
    <ul class="rows">
      {#each rows as row (row.id)}
        {@const href = hrefFor(row)}
        <li class="bill-row">
          {#if href}
            <a
              class="bill-link"
              {href}
              data-sveltekit-preload-data="hover"
              use:prefetchOnApproach={() => warmRow(row)}
              onpointerenter={() => warmRow(row)}
              onpointerdown={() => warmRow(row)}
              onfocus={() => warmRow(row)}
              aria-label={`Open ${row.payee} in your account`}
            >
              {@render content(row, true)}
            </a>
          {:else}
            <div class="bill-link">
              {@render content(row, false)}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    {#if more > 0}
      <TruncationFooter {more} label="more bills" />
    {/if}
  </div>
</CardFrame>

<style>
  .bill-list-card {
    min-width: 0;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .bill-row {
    padding: 7px 0;
    min-width: 0;
  }
  .bill-row:first-child {
    padding-top: 0;
  }
  .bill-row:last-child {
    padding-bottom: 0;
  }
  .bill-row + .bill-row {
    border-top: 1px solid color-mix(in srgb, var(--ink) 10%, var(--border));
  }
  .bill-link {
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
    gap: 3px;
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .payee {
    font-size: 13.5px;
    font-weight: 650;
    line-height: 1.35;
    color: var(--ink);
    overflow-wrap: anywhere;
    transition: color 140ms ease;
  }
  a.bill-link:hover .payee,
  a.bill-link:focus-visible .payee {
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
