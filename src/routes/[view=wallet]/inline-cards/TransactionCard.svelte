<script lang="ts">
  import { dateLabel, money } from '$lib/format.js';
  import type { TransactionEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';

  interface Props {
    card: TransactionEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const dateText = $derived(payload.date ? dateLabel(payload.date) : '');
  const amountText = $derived(
    payload.amount === null ? '' : money(payload.amount, { decimals: 2 })
  );
  const label = $derived(
    `Transaction at ${payload.description}${amountText ? `, ${amountText}` : ''}`
  );
</script>

<CardFrame {label}>
  <div class="transaction-card" data-kind="transaction">
    <div class="details">
      <span class="description">{payload.description}</span>
      {#if dateText}
        <span class="meta">{dateText}</span>
      {/if}
    </div>
    {#if amountText}
      <span class="amount">{amountText}</span>
    {/if}
  </div>
</CardFrame>

<style>
  .transaction-card {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }
  .details {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .description {
    font-size: 13.5px;
    font-weight: 650;
    line-height: 1.35;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .meta {
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
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
