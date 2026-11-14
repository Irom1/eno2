<script lang="ts">
  import { dateLabel, money, titleCase } from '$lib/format.js';
  import { asItems, asRecord } from '$lib/chat/cards.js';
  import ChatCardShell from './ChatCardShell.svelte';

  interface Props {
    payload: unknown;
  }

  let { payload }: Props = $props();

  const CAP = 6;
  const data = $derived(asRecord(payload));
  const all = $derived(asItems(payload));
  const items = $derived(all.slice(0, CAP));
  const more = $derived(Math.max(0, all.length - CAP));
  const total = $derived(typeof data.total === 'number' ? data.total : null);

  function text(value: unknown): string {
    return value === undefined || value === null ? '' : String(value);
  }

  function amountOf(entry: Record<string, unknown>): unknown {
    return entry.amount ?? entry.paymentAmount;
  }

  function dueOf(entry: Record<string, unknown>): string {
    const value = text(entry.dueDate ?? entry.upcomingPaymentDate);
    return value ? dateLabel(value) : '';
  }

  function statusOf(entry: Record<string, unknown>): string {
    const value = text(entry.status);
    return value ? titleCase(value) : '';
  }
</script>

<ChatCardShell title="Bills" badge={total !== null ? money(total, { decimals: 0 }) : undefined}>
  {#if items.length === 0}
    <p class="empty">No bills to show.</p>
  {:else}
    <ul class="rows">
      {#each items as bill, index (text(bill._id ?? bill.billId) || index)}
        <li class="row">
          <span class="row-main">
            <span class="name">{text(bill.payee) || text(bill.nickname) || 'Bill'}</span>
            <span class="meta">
              {#if dueOf(bill)}<span>{dueOf(bill)}</span>{/if}
              {#if statusOf(bill)}<span class="chip">{statusOf(bill)}</span>{/if}
            </span>
          </span>
          <span class="amount">{money(amountOf(bill), { decimals: 2 })}</span>
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
    gap: 0;
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
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    color: var(--muted);
    font-size: 11px;
  }
  .chip {
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--banner);
    color: var(--muted);
    font-size: 10px;
    font-weight: 600;
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
