<script lang="ts">
  import type { ChatCard, ChatCardKind } from '$lib/chat/cards.js';
  import { asRecord } from '$lib/chat/cards.js';
  import AccountCard from './AccountCard.svelte';
  import AccountListCard from './AccountListCard.svelte';
  import AnomaliesCard from './AnomaliesCard.svelte';
  import BillsCard from './BillsCard.svelte';
  import CashflowCard from './CashflowCard.svelte';
  import CustomerCard from './CustomerCard.svelte';
  import FallbackCard from './FallbackCard.svelte';
  import GoalCard from './GoalCard.svelte';
  import LoansCard from './LoansCard.svelte';
  import LocationsCard from './LocationsCard.svelte';
  import MerchantsCard from './MerchantsCard.svelte';
  import OverviewCard from './OverviewCard.svelte';
  import RecurringCard from './RecurringCard.svelte';
  import RewardsCard from './RewardsCard.svelte';
  import SpendingCard from './SpendingCard.svelte';
  import TransactionsCard from './TransactionsCard.svelte';

  interface Props {
    card: ChatCard;
    /** When provided, only these card kinds may render. */
    allowedKinds?: ReadonlySet<ChatCardKind>;
    /** Narrow an accounts/account card to credit cards only. */
    accountFilter?: 'all' | 'credit';
  }

  let { card, allowedKinds, accountFilter = 'all' }: Props = $props();

  const data = $derived(asRecord(card.payload));
  const creditOnly = $derived(accountFilter === 'credit');
  const accountTitle = $derived(creditOnly ? 'Credit cards' : 'Accounts');
  const allowed = $derived(!allowedKinds || allowedKinds.has(card.kind));
  const showOverview = $derived(!allowedKinds || allowedKinds.has('overview'));
  const showAccounts = $derived(!allowedKinds || allowedKinds.has('accounts'));
  const showRewards = $derived(!allowedKinds || allowedKinds.has('rewards'));
  const showCashflow = $derived(!allowedKinds || allowedKinds.has('cashflow'));
  const hasAccounts = $derived(Array.isArray(data.accounts) && data.accounts.length > 0);
  const hasCashflow = $derived(
    (Array.isArray(data.monthlyCashflow) && data.monthlyCashflow.length > 0) ||
      Object.keys(asRecord(data.cashflow90Days)).length > 0
  );
</script>

{#if card.kind === 'overview'}
  {#if showOverview}
    <OverviewCard payload={card.payload} />
  {/if}
  {#if showAccounts && hasAccounts}
    <AccountListCard payload={data.accounts} filter={accountFilter} title={accountTitle} />
  {/if}
  {#if showRewards}
    <RewardsCard payload={data.totalRewards} />
  {/if}
  {#if showCashflow && hasCashflow}
    <CashflowCard payload={data.monthlyCashflow} />
  {/if}
{:else if card.kind === 'unknown' || allowed}
  {#if card.kind === 'accounts'}
    <AccountListCard payload={card.payload} filter={accountFilter} title={accountTitle} />
  {:else if card.kind === 'account'}
    {#if !creditOnly || String(data.type ?? '').toLowerCase().includes('credit')}
      <AccountCard payload={card.payload} />
    {/if}
  {:else if card.kind === 'transactions' || card.kind === 'transaction'}
    <TransactionsCard payload={card.payload} tool={card.tool} />
  {:else if card.kind === 'bills'}
    <BillsCard payload={card.payload} />
  {:else if card.kind === 'loans'}
    <LoansCard payload={card.payload} />
  {:else if card.kind === 'recurring'}
    <RecurringCard payload={card.payload} />
  {:else if card.kind === 'spending'}
    <SpendingCard payload={card.payload} />
  {:else if card.kind === 'cashflow'}
    <CashflowCard payload={card.payload} />
  {:else if card.kind === 'anomalies'}
    <AnomaliesCard payload={card.payload} />
  {:else if card.kind === 'rewards'}
    <RewardsCard payload={card.payload} />
  {:else if card.kind === 'locations'}
    <LocationsCard payload={card.payload} />
  {:else if card.kind === 'goal'}
    <GoalCard payload={card.payload} />
  {:else if card.kind === 'customer'}
    <CustomerCard payload={card.payload} />
  {:else if card.kind === 'merchants'}
    <MerchantsCard payload={card.payload} />
  {:else}
    <FallbackCard payload={card.payload} />
  {/if}
{/if}
