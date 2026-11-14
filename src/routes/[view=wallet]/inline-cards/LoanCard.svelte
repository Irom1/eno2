<script lang="ts">
  import { loanProduct } from '$lib/products';
  import { money, titleCase } from '$lib/format.js';
  import type { LoanEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';
  import MoneyText from './primitives/MoneyText.svelte';
  import StatusChip from './StatusChip.svelte';

  interface Props {
    card: LoanEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const product = $derived(loanProduct(payload.type));
  const typeText = $derived(product?.name ?? titleCase(payload.type));
  const balanceText = $derived(
    payload.balance === null ? '' : money(payload.balance, { decimals: 2 })
  );
  const label = $derived(`Loan, ${typeText}${balanceText ? `, ${balanceText}` : ''}`);
</script>

<CardFrame {label}>
  <div class="loan-card" class:product={product} data-kind="loan" style:--product-gradient={product?.gradient} style:--product-ink={product?.ink}>
    <div class="loan-head">
      <span class="type">{typeText}</span>
      <span class="side">
        {#if payload.status}
          <StatusChip status={payload.status} />
        {/if}
      </span>
    </div>
    <div class="loan-figures">
      {#if payload.balance !== null}
        <span class="balance"><MoneyText amount={payload.balance} decimals={2} /></span>
      {/if}
      {#if payload.monthlyPayment !== null}
        <span class="payment"><MoneyText amount={payload.monthlyPayment} decimals={2} />/mo</span>
      {/if}
    </div>
  </div>
</CardFrame>

<style>
  .loan-card {
    min-width: 0;
  }
  .product {
    border-radius: 8px;
    padding: 10px 12px;
    background: var(--product-gradient);
    --ink: var(--product-ink);
    --muted: var(--product-ink);
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
