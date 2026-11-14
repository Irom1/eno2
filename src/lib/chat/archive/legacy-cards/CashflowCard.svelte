<script lang="ts">
  import { money, monthLabel } from '$lib/format.js';
  import { asRecord } from '$lib/chat/cards.js';
  import ChatCardShell from './ChatCardShell.svelte';

  interface Props {
    payload: unknown;
  }

  let { payload }: Props = $props();

  function records(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
        )
      : [];
  }

  function text(value: unknown): string {
    return value === undefined || value === null ? '' : String(value);
  }

  function num(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const data = $derived(asRecord(payload));
  const rows = $derived(Array.isArray(payload) ? records(payload) : records(data.monthlyCashflow));
  const summary = $derived(asRecord(data.cashflow90Days));
  const hasSummary = $derived('inflow' in summary || 'outflow' in summary);
</script>

<ChatCardShell title="Cashflow">
  {#if rows.length > 0}
    <div class="table" role="table" aria-label="Monthly cashflow">
      <div class="table-head" role="row">
        <span role="columnheader">Month</span>
        <span role="columnheader">In</span>
        <span role="columnheader">Out</span>
        <span role="columnheader">Net</span>
      </div>
      {#each rows as row, index (text(row.month) || index)}
        <div class="table-row" role="row">
          <span class="month">{text(row.month) ? monthLabel(text(row.month)) : '—'}</span>
          <span class="cell in">{money(row.inflow, { decimals: 0 })}</span>
          <span class="cell out">{money(row.outflow, { decimals: 0 })}</span>
          <span class="cell net" class:negative={num(row.net) < 0} class:positive={num(row.net) > 0}>{money(row.net, { decimals: 0 })}</span>
        </div>
      {/each}
    </div>
  {:else if hasSummary}
    <div class="summary">
      <span class="sum-label">Last 90 days</span>
      <div class="sum-grid">
        <div>
          <span class="small">In</span>
          <strong class="positive">{money(summary.inflow, { decimals: 0 })}</strong>
        </div>
        <div>
          <span class="small">Out</span>
          <strong>{money(summary.outflow, { decimals: 0 })}</strong>
        </div>
        <div>
          <span class="small">Net</span>
          <strong class:negative={num(summary.net) < 0} class:positive={num(summary.net) > 0}>{money(summary.net, { decimals: 0 })}</strong>
        </div>
      </div>
    </div>
  {:else}
    <p class="empty">No cashflow to show.</p>
  {/if}
</ChatCardShell>

<style>
  .table {
    display: grid;
    gap: 0;
  }
  .table-head,
  .table-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) repeat(3, minmax(0, 0.85fr));
    gap: 6px;
    align-items: baseline;
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
  }
  .table-head {
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 600;
  }
  .table-row:last-child {
    border-bottom: none;
  }
  .table-head span:not(:first-child),
  .cell,
  .net {
    text-align: right;
  }
  .month {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cell {
    font-variant-numeric: tabular-nums;
    font-size: 11.5px;
  }
  .out {
    color: var(--muted);
  }
  .in {
    color: var(--green, #2f8a5e);
  }
  .net {
    font-weight: 650;
  }
  .summary {
    display: grid;
    gap: 8px;
  }
  .sum-label {
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
  }
  .sum-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .sum-grid > div {
    display: grid;
    gap: 1px;
    padding: 7px 9px;
    border-radius: 10px;
    background: var(--banner);
  }
  .small {
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 600;
  }
  .sum-grid strong {
    font-size: 13px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .negative {
    color: var(--red, #a95842);
  }
  .positive {
    color: var(--green, #2f8a5e);
  }
  .empty {
    margin: 0;
    color: var(--muted);
  }
</style>
