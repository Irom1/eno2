<script lang="ts">
  import { money, titleCase } from '$lib/format.js';
  import { asItems, asRecord } from '$lib/chat/cards.js';
  import ChatCardShell from './ChatCardShell.svelte';

  interface Props {
    payload: unknown;
  }

  let { payload }: Props = $props();

  const CAP = 6;
  const data = $derived(asRecord(payload));
  const summary = $derived(
    'monthlyPayment' in data && 'count' in data && !('_id' in data) && !Array.isArray(data.items)
  );
  const all = $derived(summary ? [] : asItems(payload));
  const items = $derived(all.slice(0, CAP));
  const more = $derived(Math.max(0, all.length - CAP));

  function text(value: unknown): string {
    return value === undefined || value === null ? '' : String(value);
  }

  function num(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const count = $derived(summary ? num(data.count) : all.length);
</script>

<ChatCardShell title="Loans" badge={count ? `${count}` : undefined}>
  {#if summary && num(data.monthlyPayment) > 0}
    <div class="summary">
      <span class="sum-label">Monthly payments</span>
      <strong class="sum-value">{money(data.monthlyPayment, { decimals: 0 })}</strong>
    </div>
  {/if}

  {#if items.length === 0}
    {#if !summary}
      <p class="empty">No loans to show.</p>
    {/if}
  {:else}
    <ul class="rows">
      {#each items as loan, index (text(loan._id) || index)}
        <li class="row">
          <span class="row-main">
            <span class="name">{text(loan.type) || text(loan.description) || 'Loan'}</span>
            <span class="meta">
              <span>Balance {money(loan.amount, { decimals: 0 })}</span>
              {#if num(loan.creditScore) > 0}<span>Credit score {num(loan.creditScore)}</span>{/if}
              {#if text(loan.status)}<span class="chip">{titleCase(text(loan.status))}</span>{/if}
            </span>
          </span>
          <span class="row-value">
            <strong>{money(loan.monthlyPayment, { decimals: 0 })}</strong>
            <span class="sub">Monthly payment</span>
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
  .summary {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    margin-bottom: 8px;
    border-radius: 10px;
    background: var(--banner);
  }
  .sum-label {
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
  }
  .sum-value {
    font-size: 16px;
    font-weight: 650;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
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
  .row-value {
    display: grid;
    gap: 1px;
    text-align: right;
    flex: none;
  }
  .row-value strong {
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .sub {
    color: var(--muted);
    font-size: 10.5px;
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
