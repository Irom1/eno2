<script lang="ts">
  import { money, percent } from '$lib/format.js';
  import { asRecord } from './cards.js';
  import ChatCardShell from './ChatCardShell.svelte';

  interface Props {
    payload: unknown;
  }

  let { payload }: Props = $props();

  const data = $derived(asRecord(payload));
  const accounts = $derived(Array.isArray(data.accounts) ? data.accounts : []);
  const bills = $derived(asRecord(data.upcomingBills));
  const loans = $derived(asRecord(data.loanObligations));
  const hasData = $derived(Object.keys(data).length > 0);
  const savingsRate = $derived(typeof data.savingsRate === 'number' ? data.savingsRate : 0);
</script>

<ChatCardShell title="Overview">
  {#if !hasData}
    <p class="empty">No overview available right now.</p>
  {:else}
    <div class="metrics">
      <div class="metric">
        <span class="label">Liquid cash</span>
        <strong>{money(data.liquidTotal, { decimals: 0 })}</strong>
      </div>
      <div class="metric">
        <span class="label">Card balances</span>
        <strong>{money(data.cardBalances, { decimals: 0 })}</strong>
      </div>
      <div class="metric">
        <span class="label">Savings rate</span>
        <strong>{percent(savingsRate)}</strong>
      </div>
      <div class="metric">
        <span class="label">Accounts</span>
        <strong>{accounts.length}</strong>
      </div>
    </div>

    <div class="summary-rows">
      <div class="summary-row">
        <span class="label">Bills due</span>
        <span class="value">
          {money(bills.total, { decimals: 0 })}
          <span class="muted">· {Number(bills.count ?? 0)} bills</span>
        </span>
      </div>
      <div class="summary-row">
        <span class="label">Monthly loan payments</span>
        <span class="value">
          {money(loans.monthlyPayment, { decimals: 0 })}
          <span class="muted">· {Number(loans.count ?? 0)} loans</span>
        </span>
      </div>
    </div>
  {/if}
</ChatCardShell>

<style>
  .metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .metric {
    display: grid;
    gap: 1px;
    padding: 7px 9px;
    border-radius: 10px;
    background: var(--banner);
    min-width: 0;
  }
  .metric strong {
    font-size: 15px;
    font-weight: 650;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .label {
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
  }
  .summary-rows {
    display: grid;
    gap: 6px;
    margin-top: 9px;
  }
  .summary-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
  }
  .value {
    font-weight: 650;
    text-align: right;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .muted {
    color: var(--muted);
    font-weight: 500;
  }
  .empty {
    margin: 0;
    color: var(--muted);
  }
</style>
