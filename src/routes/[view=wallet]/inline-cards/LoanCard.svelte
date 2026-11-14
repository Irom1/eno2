<script lang="ts">
  import { money, titleCase } from '$lib/format.js';
  import { accountHref, type LoanEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';
  import OpenIcon from './OpenIcon.svelte';
  import StatusChip from './StatusChip.svelte';

  interface Props {
    card: LoanEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const typeText = $derived(titleCase(payload.type));
  const balanceText = $derived(
    payload.balance === null ? '' : money(payload.balance, { decimals: 2 })
  );
  const paymentText = $derived(
    payload.monthlyPayment === null ? '' : money(payload.monthlyPayment, { decimals: 2 })
  );
  const href = $derived(accountHref(payload.customerId, payload.accountId));
  const label = $derived(`Loan, ${typeText}${balanceText ? `, ${balanceText}` : ''}`);
</script>

{#snippet content(linked: boolean)}
  <div class="loan-head">
    <span class="type">{typeText}</span>
    <span class="side">
      {#if payload.status}
        <StatusChip status={payload.status} />
      {/if}
      {#if linked}
        <OpenIcon />
      {/if}
    </span>
  </div>
  <div class="loan-figures">
    {#if balanceText}
      <span class="balance">{balanceText}</span>
    {/if}
    {#if paymentText}
      <span class="payment">{paymentText}/mo</span>
    {/if}
  </div>
{/snippet}

<CardFrame {label}>
  <div class="loan-card" data-kind="loan">
    {#if href}
      <a
        class="loan-link"
        {href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${typeText} loan in your account`}
      >
        {@render content(true)}
      </a>
    {:else}
      {@render content(false)}
    {/if}
  </div>
</CardFrame>

<style>
  .loan-card {
    min-width: 0;
  }
  .loan-link {
    display: block;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }
  .loan-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }
  .type {
    font-size: 13.5px;
    font-weight: 650;
    line-height: 1.35;
    color: var(--ink);
    overflow-wrap: anywhere;
    transition: color 140ms ease;
  }
  a.loan-link:hover .type,
  a.loan-link:focus-visible .type {
    color: var(--link);
  }
  .side {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
  }
  .loan-figures {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-top: 8px;
    min-width: 0;
  }
  .balance {
    font-size: 15px;
    font-weight: 700;
    line-height: 1.3;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .payment {
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
    text-align: right;
    white-space: nowrap;
  }
</style>
