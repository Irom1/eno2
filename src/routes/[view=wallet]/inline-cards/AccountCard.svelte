<script lang="ts">
  import { money, titleCase } from '$lib/format.js';
  import { accountHref, type AccountEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';
  import MoneyText from './primitives/MoneyText.svelte';
  import OpenIcon from './OpenIcon.svelte';

  interface Props {
    card: AccountEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const typeText = $derived(titleCase(payload.type));
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
    `${payload.nickname || typeText} account${balanceText ? `, ${balanceText}` : ''}`
  );
</script>

{#snippet content(linked: boolean)}
  <div class="account-head">
    <span class="nickname">{payload.nickname}</span>
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

<CardFrame {label}>
  <div class="account-card" data-kind="account">
    {#if href}
      <a
        class="account-link"
        {href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${payload.nickname} account`}
      >
        {@render content(true)}
      </a>
    {:else}
      {@render content(false)}
    {/if}
  </div>
</CardFrame>

<style>
  .account-card {
    min-width: 0;
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
