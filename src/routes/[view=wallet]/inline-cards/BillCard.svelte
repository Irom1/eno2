<script lang="ts">
  import { money } from '$lib/format.js';
  import { GUEST_CUSTOMER_ID } from '$lib/chat/guest';
  import { prefetchTransactionContext } from '$lib/walletCache';
  import { prefetchOnApproach } from '$lib/prefetchOnApproach';
  import {
    billHref,
    type BillEntityCard
  } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';
  import DateText from './primitives/DateText.svelte';
  import MoneyText from './primitives/MoneyText.svelte';
  import OpenIcon from './OpenIcon.svelte';
  import StatusChip from './StatusChip.svelte';

  interface Props {
    card: BillEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const amountText = $derived(
    payload.amount === null ? '' : money(payload.amount, { decimals: 2 })
  );
  const href = $derived(billHref(payload.customerId, payload.accountId, payload.billId));
  const label = $derived(`Bill for ${payload.payee}${amountText ? `, ${amountText}` : ''}`);

  function warmContext(): void {
    if (!href || !payload.customerId || payload.customerId === GUEST_CUSTOMER_ID) return;
    void prefetchTransactionContext(payload.customerId, payload.accountId);
  }
</script>

{#snippet content(linked: boolean)}
  <div class="bill-head">
    <span class="payee">{payload.payee}</span>
    {#if payload.status}
      <StatusChip status={payload.status} />
    {/if}
  </div>
  <div class="bill-meta">
    {#if payload.dueDate}
      <span class="due">Due <DateText value={payload.dueDate} /></span>
    {/if}
    <span class="side">
      {#if payload.amount !== null}
        <span class="amount"><MoneyText amount={payload.amount} decimals={2} /></span>
      {/if}
      {#if linked}
        <OpenIcon />
      {/if}
    </span>
  </div>
{/snippet}

<CardFrame {label}>
  <div class="bill-card" data-kind="bill">
    {#if href}
      <a
        class="bill-link"
        {href}
        onpointerdown={warmContext}
        use:prefetchOnApproach={warmContext}
        aria-label={`Open ${payload.payee} in your account`}
      >
        {@render content(true)}
      </a>
    {:else}
      {@render content(false)}
    {/if}
  </div>
</CardFrame>

<style>
  .bill-card {
    min-width: 0;
  }
  .bill-link {
    display: block;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }
  .bill-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
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
  .bill-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 6px;
    min-width: 0;
  }
  .due {
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
