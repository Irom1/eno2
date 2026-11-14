<script lang="ts">
  import { money } from '$lib/format.js';
  import type { RecurringChargeEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';
  import DateText from './primitives/DateText.svelte';
  import MoneyText from './primitives/MoneyText.svelte';

  interface Props {
    card: RecurringChargeEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const amountText = $derived(
    payload.averageAmount === null ? '' : money(payload.averageAmount, { decimals: 2 })
  );
  const monthsText = $derived(
    payload.monthsSeen > 0
      ? `Seen in ${payload.monthsSeen} ${payload.monthsSeen === 1 ? 'month' : 'months'}`
      : ''
  );
  const label = $derived(
    `Recurring charge, ${payload.description}${amountText ? `, ${amountText}` : ''}`
  );
</script>

<CardFrame {label}>
  <div class="recurring-card" data-kind="recurring">
    <div class="description">{payload.description}</div>
    <div class="recurring-meta">
      {#if amountText}
        <span class="amount"><MoneyText amount={payload.averageAmount} decimals={2} /></span>
      {/if}
      {#if monthsText}
        <span class="months">{monthsText}</span>
      {/if}
      {#if payload.lastDate}
        <span class="last">Last <DateText value={payload.lastDate} /></span>
      {/if}
    </div>
  </div>
</CardFrame>

<style>
  .recurring-card {
    min-width: 0;
  }
  .description {
    font-size: 13.5px;
    font-weight: 650;
    line-height: 1.35;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .recurring-meta {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 6px;
    min-width: 0;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
  }
  .amount {
    color: var(--ink);
    font-size: 13.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .months,
  .last {
    white-space: nowrap;
  }
  .months::before,
  .last::before {
    content: '·';
    margin-right: 8px;
    color: var(--muted);
  }
</style>
