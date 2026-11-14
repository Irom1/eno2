<script lang="ts">
  import type { EntityCard } from '$lib/chat/entityCards.js';
  import TransactionCard from './TransactionCard.svelte';
  import TransactionListCard from './TransactionListCard.svelte';
  import PieChartCard from './PieChartCard.svelte';
  import BillCard from './BillCard.svelte';
  import AccountCard from './AccountCard.svelte';
  import LoanCard from './LoanCard.svelte';
  import LocationCard from './LocationCard.svelte';
  import RecurringChargeCard from './RecurringChargeCard.svelte';
  import RewardCard from './RewardCard.svelte';
  import GoalCard from './GoalCard.svelte';
  import CashflowPointCard from './CashflowPointCard.svelte';
  import MerchantCard from './MerchantCard.svelte';
  import ProfileCard from './ProfileCard.svelte';

  interface Props {
    card: EntityCard;
    /** Render single-entity cards as compact rows inside the assistant bubble. */
    inline?: boolean;
  }

  let { card, inline = false }: Props = $props();
</script>

{#if card.kind === 'transaction'}
  <TransactionCard {card} {inline} />
{:else if card.kind === 'transaction-list'}
  <TransactionListCard {card} />
{:else if card.kind === 'spending-pie'}
  <PieChartCard {card} />
{:else if card.kind === 'bill'}
  <BillCard {card} />
{:else if card.kind === 'account'}
  <AccountCard {card} />
{:else if card.kind === 'loan'}
  <LoanCard {card} />
{:else if card.kind === 'location'}
  <LocationCard {card} />
{:else if card.kind === 'recurring'}
  <RecurringChargeCard {card} />
{:else if card.kind === 'reward'}
  <RewardCard {card} />
{:else if card.kind === 'goal'}
  <GoalCard {card} />
{:else if card.kind === 'cashflow'}
  <CashflowPointCard {card} />
{:else if card.kind === 'merchant'}
  <MerchantCard {card} />
{:else if card.kind === 'profile'}
  <ProfileCard {card} />
{/if}
