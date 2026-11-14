<script lang="ts">
  import { money } from '$lib/format.js';
  import { asItems } from '$lib/chat/cards.js';
  import ChatCardShell from './ChatCardShell.svelte';

  interface Props {
    payload: unknown;
    filter?: 'all' | 'credit';
    title?: string;
  }

  let { payload, filter = 'all', title = 'Accounts' }: Props = $props();

  const all = $derived(asItems(payload));
  const items = $derived(
    filter === 'credit'
      ? all.filter((account) => text(account.type).toLowerCase().includes('credit'))
      : all
  );

  function text(value: unknown): string {
    return value === undefined || value === null ? '' : String(value);
  }

  function num(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function tint(type: unknown): string {
    const value = text(type).toLowerCase();
    if (value.includes('checking')) return 'checking';
    if (value.includes('savings')) return 'savings';
    if (value.includes('credit')) return 'credit';
    return 'other';
  }

  function isCredit(type: unknown): boolean {
    return text(type).toLowerCase().includes('credit');
  }

  function masked(value: unknown): string {
    const digits = text(value).replace(/\D+/g, '');
    if (!digits) return 'Account';
    return `•••• ${digits.slice(-4)}`;
  }
</script>

<ChatCardShell {title}>
  {#if items.length === 0}
    <p class="empty">{filter === 'credit' ? 'No credit cards.' : 'No accounts to show.'}</p>
  {:else}
    <ul class="rows">
      {#each items as account, index (text(account._id) || index)}
        <li class="row">
          <span class="dot {tint(account.type)}" aria-hidden="true"></span>
          <span class="row-main">
            <span class="name">{text(account.nickname) || text(account.type) || 'Account'}</span>
            <span class="meta">{text(account.type)} · {masked(account.accountNumber)}</span>
          </span>
          <span class="row-value">
            <strong>{money(account.balance, { decimals: 0 })}</strong>
            {#if isCredit(account.type) && num(account.rewards) > 0}
              <span class="rewards">{num(account.rewards).toLocaleString()} pts</span>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</ChatCardShell>

<style>
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
    max-height: 240px;
    overflow-y: auto;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
    min-width: 0;
  }
  .row:last-child {
    border-bottom: none;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
    background: var(--muted);
  }
  .dot.checking {
    background: #4f7a8c;
  }
  .dot.savings {
    background: #1c4f6b;
  }
  .dot.credit {
    background: #a95842;
  }
  .dot.other {
    background: #8a6b8f;
  }
  .row-main {
    display: grid;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }
  .name {
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    color: var(--muted);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
  .rewards {
    color: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    margin: 0;
    color: var(--muted);
  }
</style>
