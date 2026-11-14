<script lang="ts">
  import { dateLabel, money } from '$lib/format.js';
  import { transactionHref, type TransactionEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';
  import OpenIcon from './OpenIcon.svelte';

  interface Props {
    card: TransactionEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const dateText = $derived(payload.date ? dateLabel(payload.date) : '');
  const amountText = $derived(
    payload.amount === null ? '' : money(payload.amount, { decimals: 2 })
  );
  const href = $derived(
    transactionHref(payload.customerId, payload.accountId, payload.transactionId)
  );
  const label = $derived(
    `Transaction at ${payload.description}${amountText ? `, ${amountText}` : ''}`
  );
</script>

{#snippet content(linked: boolean)}
  <div class="details">
    <span class="description">{payload.description}</span>
    {#if dateText}
      <span class="meta">{dateText}</span>
    {/if}
  </div>
  <span class="side">
    {#if amountText}
      <span class="amount">{amountText}</span>
    {/if}
    {#if linked}
      <OpenIcon />
    {/if}
  </span>
{/snippet}

<CardFrame {label}>
  <div class="transaction-card" data-kind="transaction">
    {#if href}
      <a
        class="transaction-link"
        {href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${payload.description} in your account`}
      >
        {@render content(true)}
      </a>
    {:else}
      <div class="transaction-link">
        {@render content(false)}
      </div>
    {/if}
  </div>
</CardFrame>

<style>
  .transaction-card {
    min-width: 0;
  }
  .transaction-link {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    color: inherit;
    text-decoration: none;
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
    transition: color 140ms ease;
  }
  a.transaction-link:hover .description,
  a.transaction-link:focus-visible .description {
    color: var(--link);
  }
  .meta {
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
