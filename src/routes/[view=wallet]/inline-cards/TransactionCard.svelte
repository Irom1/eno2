<script lang="ts">
  import { dateLabel, money } from '$lib/format.js';
  import type { TransactionEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';

  interface Props {
    card: TransactionEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const isDuplicate = $derived(payload.flag === 'duplicate');
  const flagLabel = $derived(isDuplicate ? 'Possible duplicate' : 'Unusual amount');
  const dateText = $derived(payload.date ? dateLabel(payload.date) : '');
  const alsoText = $derived(
    isDuplicate && payload.duplicateOf ? `also ${dateLabel(payload.duplicateOf)}` : ''
  );
  const metaText = $derived(
    dateText && alsoText ? `${dateText} · ${alsoText}` : dateText || alsoText
  );
  const amountText = $derived(
    payload.amount === null ? '' : money(payload.amount, { decimals: 2 })
  );
  const label = $derived(
    `${flagLabel}: ${payload.description}${amountText ? ` ${amountText}` : ''}`
  );
</script>

<CardFrame {label}>
  <div class="transaction-card" data-kind="transaction" data-flag={payload.flag}>
    <div class="details">
      <span class="flag">{flagLabel}</span>
      <span class="description">{payload.description}</span>
      {#if metaText}
        <span class="meta">{metaText}</span>
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
  .flag {
    width: fit-content;
    padding: 1px 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--ink) 14%, var(--border));
    background: var(--banner);
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 650;
    white-space: nowrap;
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
