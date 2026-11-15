<script lang="ts">
  import { dateLabel, money } from '$lib/format.js';
  import { accountHref, type GoalEntityCard } from '$lib/chat/entityCards.js';
  import { GUEST_CUSTOMER_ID } from '$lib/chat/guest';
  import { prefetchTransactionContext } from '$lib/walletCache';
  import { prefetchOnApproach } from '$lib/prefetchOnApproach';
  import CardFrame from './CardFrame.svelte';
  import EntityKeyValue from './EntityKeyValue.svelte';
  import OpenIcon from './OpenIcon.svelte';
  import ProgressMeter from './primitives/ProgressMeter.svelte';

  interface Props {
    card: GoalEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const href = $derived(accountHref(payload.customerId, payload.accountId));
  const targetText = $derived(money(payload.target, { decimals: 2 }));
  const currentText = $derived(money(payload.current, { decimals: 2 }));
  const monthsText = $derived(
    payload.monthsToTarget === null
      ? ''
      : `${payload.monthsToTarget.toLocaleString('en-US')} ${
          payload.monthsToTarget === 1 ? 'month' : 'months'
        }`
  );
  const projectedText = $derived(
    payload.projectedDate ? dateLabel(payload.projectedDate) : ''
  );
  const label = $derived(`Goal, target ${targetText}`);

  function warmContext(): void {
    if (!href || !payload.customerId || payload.customerId === GUEST_CUSTOMER_ID) return;
    void prefetchTransactionContext(payload.customerId, payload.accountId);
  }
</script>

{#snippet content(linked: boolean)}
  {#if linked}
    <div class="goal-head">
      <OpenIcon />
    </div>
  {/if}
  <div class="goal-rows">
    <EntityKeyValue label="Target" value={targetText} />
    <EntityKeyValue label="Current" value={currentText} />
    {#if monthsText}
      <EntityKeyValue label="Months to target" value={monthsText} />
    {/if}
    {#if projectedText}
      <EntityKeyValue label="Projected date" value={projectedText} />
    {/if}
  </div>
  {#if payload.target > 0}
    <div class="goal-meter">
      <ProgressMeter value={payload.current} max={payload.target} />
    </div>
  {/if}
{/snippet}

<CardFrame {label}>
  <div class="goal-card" data-kind="goal">
    {#if href}
      <a
        class="goal-link"
        {href}
        onpointerdown={warmContext}
        use:prefetchOnApproach={warmContext}
        aria-label="Open the goal account"
      >
        {@render content(true)}
      </a>
    {:else}
      {@render content(false)}
    {/if}
  </div>
</CardFrame>

<style>
  .goal-card {
    min-width: 0;
  }
  .goal-link {
    display: block;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }
  .goal-head {
    display: flex;
    justify-content: flex-end;
    min-height: 14px;
    margin-bottom: 4px;
  }
  .goal-rows {
    min-width: 0;
  }
  .goal-meter {
    margin-top: 8px;
  }
</style>
