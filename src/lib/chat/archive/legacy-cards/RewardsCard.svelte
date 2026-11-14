<script lang="ts">
  import { asRecord } from '$lib/chat/cards.js';
  import ChatCardShell from './ChatCardShell.svelte';

  interface Props {
    payload: unknown;
  }

  let { payload }: Props = $props();

  function text(value: unknown): string {
    return value === undefined || value === null ? '' : String(value);
  }

  function num(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function points(value: unknown): string {
    return Math.round(num(value)).toLocaleString('en-US');
  }

  const data = $derived(asRecord(payload));
  const total = $derived(typeof payload === 'number' ? num(payload) : num(data.totalRewards));
  const accounts = $derived(
    Array.isArray(data.accounts)
      ? (data.accounts as unknown[]).filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
        )
      : []
  );
  const creditAccounts = $derived(
    accounts.filter(
      (account) => text(account.type).toLowerCase().includes('credit') && num(account.rewards) > 0
    )
  );
</script>

<ChatCardShell title="Rewards">
  {#if total <= 0 && creditAccounts.length === 0}
    <p class="empty">No rewards points yet.</p>
  {:else}
    <div class="points">
      <strong class="points-value">{points(total)}</strong>
      <span class="points-suffix">points</span>
    </div>
    {#if creditAccounts.length > 0}
      <ul class="rows">
        {#each creditAccounts as account, index (text(account._id) || index)}
          <li class="row">
            <span class="name">{text(account.nickname) || 'Credit card'}</span>
            <span class="value">{points(account.rewards)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</ChatCardShell>

<style>
  .points {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--banner);
  }
  .points-value {
    font-size: 26px;
    line-height: 1.1;
    font-weight: 650;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .points-suffix {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  .rows {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: grid;
    max-height: 180px;
    overflow-y: auto;
  }
  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }
  .row:last-child {
    border-bottom: none;
  }
  .name {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
  }
  .value {
    flex: none;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    font-weight: 650;
  }
  .empty {
    margin: 0;
    color: var(--muted);
  }
</style>
