<script lang="ts">
  import { money } from '$lib/format.js';
  import { transactionHref, type TransactionEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';
  import DateText from './primitives/DateText.svelte';
  import MoneyText from './primitives/MoneyText.svelte';
  import OpenIcon from './OpenIcon.svelte';

  interface Props {
    card: TransactionEntityCard;
    /** Render as a compact row inside an assistant bubble, without CardFrame. */
    inline?: boolean;
  }

  let { card, inline = false }: Props = $props();

  const payload = $derived(card.payload);
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
    {#if payload.date}
      <span class="meta"><DateText value={payload.date} /></span>
    {/if}
  </div>
  <span class="side">
    {#if payload.amount !== null}
      <span class="amount"><MoneyText amount={payload.amount} decimals={2} /></span>
    {/if}
    {#if linked}
      <OpenIcon />
    {/if}
  </span>
{/snippet}

{#if inline}
  {#if href}
    <a
      class="transaction-card inline transaction-link"
      data-kind="transaction"
      {href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${payload.description} in your account`}
    >
      {@render content(true)}
    </a>
  {:else}
    <div class="transaction-card inline transaction-link" data-kind="transaction">
      {@render content(false)}
    </div>
  {/if}
{:else}
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
{/if}

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
  .transaction-card.inline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin: 6px 0;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface) 72%, transparent);
    box-shadow: none;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }
  .transaction-card.inline .description {
    font-size: 13px;
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
