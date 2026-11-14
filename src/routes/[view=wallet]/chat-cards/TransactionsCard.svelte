<script lang="ts">
  import { dateLabel, money, titleCase } from '$lib/format.js';
  import { asItems, transactionKind } from '$lib/chat/cards.js';
  import ChatCardShell from './ChatCardShell.svelte';

  interface Props {
    payload: unknown;
    tool: string;
  }

  let { payload, tool }: Props = $props();

  const CAP = 8;
  const kind = $derived(transactionKind(tool));
  const single = $derived(tool.includes('_get_'));
  const title = $derived(single ? 'Transaction' : kind === 'deposit' ? 'Deposits' : 'Withdrawals');
  const all = $derived(asItems(payload));
  const items = $derived(all.slice(0, CAP));
  const more = $derived(Math.max(0, all.length - CAP));

  function text(value: unknown): string {
    return value === undefined || value === null ? '' : String(value);
  }

  function status(value: unknown): string {
    const label = text(value);
    return label ? titleCase(label) : '';
  }

  function when(value: unknown): string {
    const label = text(value);
    return label ? dateLabel(label) : '';
  }
</script>

<ChatCardShell
  title={title}
  badge={!single && all.length ? `${all.length}` : undefined}
>
  {#if items.length === 0}
    <p class="empty">No {single ? 'transaction' : kind === 'deposit' ? 'deposits' : 'withdrawals'} to show.</p>
  {:else}
    <ul class="rows">
      {#each items as entry, index (text(entry._id) || index)}
        <li class="row">
          <span class="row-main">
            <span class="name">{text(entry.description) || 'Transaction'}</span>
            <span class="meta">
              {#if when(entry.transactionDate ?? entry.date)}<span>{when(entry.transactionDate ?? entry.date)}</span>{/if}
              {#if status(entry.status)}<span class="chip">{status(entry.status)}</span>{/if}
            </span>
          </span>
          <span class="amount {kind}">
            {kind === 'deposit' ? `+${money(entry.amount, { decimals: 0 })}` : money(entry.amount, { decimals: 0 })}
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
    gap: 0;
    max-height: 280px;
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
  .amount.deposit {
    color: var(--green, #2f8a5e);
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
