<script lang="ts">
  import { accountProduct } from '$lib/products';
  import { money, titleCase } from '$lib/format.js';
  import { GUEST_CUSTOMER_ID } from '$lib/chat/guest';
  import { prefetchTransactionContext } from '$lib/walletCache';
  import { prefetchOnApproach } from '$lib/prefetchOnApproach';
  import { accountHref, type AccountEntityCard } from '$lib/chat/entityCards.js';
  import MoneyText from './primitives/MoneyText.svelte';
  import OpenIcon from './OpenIcon.svelte';

  interface Props {
    card: AccountEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const product = $derived(accountProduct(payload.type, payload.nickname));
  const typeText = $derived(titleCase(payload.type));
  const productName = $derived(product?.name ?? (payload.nickname || typeText));
  const balanceText = $derived(
    payload.balance === null ? '' : money(payload.balance, { decimals: 2 })
  );
  const rewardsText = $derived(
    payload.rewards !== null && payload.rewards > 0
      ? `${payload.rewards.toLocaleString('en-US')} points`
      : ''
  );
  const href = $derived(accountHref(payload.customerId, payload.accountId));
  const label = $derived(
    `${productName} account${balanceText ? `, ${balanceText}` : ''}`
  );

  function warmContext(): void {
    if (!href || !payload.customerId || payload.customerId === GUEST_CUSTOMER_ID) return;
    void prefetchTransactionContext(payload.customerId, payload.accountId);
  }
</script>

{#snippet content(linked: boolean)}
  <div class="account-head">
    <span class="nickname">{productName}</span>
    {#if linked}
      <OpenIcon />
    {/if}
  </div>
  <div class="account-meta">
    <span class="type">{typeText}</span>
    {#if payload.maskedNumber}
      <span class="masked">{payload.maskedNumber}</span>
    {/if}
  </div>
  <div class="account-figures">
    {#if payload.balance !== null}
      <span class="balance"><MoneyText amount={payload.balance} decimals={2} /></span>
    {/if}
    {#if rewardsText}
      <span class="rewards">{rewardsText}</span>
    {/if}
  </div>
{/snippet}

<article
  class="account-card"
  class:product={product}
  data-kind="account"
  aria-label={label}
  style:--product-gradient={product?.gradient}
  style:--product-ink={product?.ink}
>
  {#if href}
    <a
      class="account-link"
      {href}
      onpointerdown={warmContext}
      use:prefetchOnApproach={warmContext}
      aria-label={`Open ${productName} account`}
    >
      {@render content(true)}
    </a>
  {:else}
    {@render content(false)}
  {/if}
</article>

<style>
  .account-card {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    /* Same vertical rhythm the former CardFrame provided inline. */
    margin: 6px 0;
  }
  .account-card:not(.product) {
    border: 1px solid color-mix(in srgb, var(--ink) 16%, var(--border));
    border-radius: 8px;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--surface) 80%, transparent);
  }
  .product {
    border-radius: 8px;
    padding: 10px 12px;
    background: var(--product-gradient);
    color: var(--product-ink);
    --ink: var(--product-ink);
    --muted: var(--product-ink);
    --link: var(--product-ink);
  }
  .account-link {
    display: block;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }
  .account-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }
  .nickname {
    font-size: 13.5px;
    font-weight: 650;
    line-height: 1.35;
    color: var(--ink);
    overflow-wrap: anywhere;
    transition: color 140ms ease;
  }
  a.account-link:hover .nickname,
  a.account-link:focus-visible .nickname {
    color: var(--link);
  }
  .account-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 3px;
    min-width: 0;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
  }
  .type {
    overflow-wrap: anywhere;
  }
  .masked {
    flex: none;
    font-variant-numeric: tabular-nums;
  }
  .account-figures {
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
  .rewards {
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
    text-align: right;
    white-space: nowrap;
  }
</style>
