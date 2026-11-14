<script lang="ts">
  import { dateLabel, money } from '$lib/format';
  import { accountEnding, upcomingBills, type WalletAccount, type WalletBill, type WalletCustomer, type WalletTransaction } from '$lib/wallet';

  interface Props {
    account: WalletAccount;
    customer: WalletCustomer | null;
    transactions: WalletTransaction[];
    bills: WalletBill[];
    highlightId: string;
    focusTransactionId?: string;
    onDetails: () => void;
    onBills: () => void;
    onTransaction: (transaction: WalletTransaction) => void;
    onBill: (bill: WalletBill) => void;
  }

  let { account, customer, transactions, bills, highlightId, focusTransactionId, onDetails, onBills, onTransaction, onBill }: Props = $props();
  let query = $state('');
  let paymentsOnly = $state(false);
  let filterOpen = $state(false);
  let kind = $state<'all' | WalletTransaction['kind']>('all');

  let cardName = $derived(account.nickname || account.type);
  let ending = $derived(accountEnding(account));
  let holder = $derived(customer ? [customer.firstName, customer.lastName && `${customer.lastName[0]}.`].filter(Boolean).join(' ') : '');
  let cardLabel = $derived([holder, ending && `…${ending}`].filter(Boolean).join(' '));
  let [dollars, cents] = $derived(money(account.balance, { decimals: 2 }).split('.'));
  let searchTerm = $derived(query.trim().toLowerCase());
  let scheduled = $derived(upcomingBills(bills).filter((bill) =>
    kind !== 'withdrawal' && `${bill.payee} ${bill.nickname}`.toLowerCase().includes(searchTerm)
  ));
  let matching = $derived(transactions.filter((transaction) => {
    const selectedKind = paymentsOnly ? 'deposit' : kind;
    return (selectedKind === 'all' || transaction.kind === selectedKind) &&
      transaction.description.toLowerCase().includes(searchTerm);
  }));
  let pending = $derived(matching.filter(isPending));
  let posted = $derived(matching.filter((transaction) => !isPending(transaction)));

  $effect(() => {
    if (focusTransactionId) {
      query = '';
      paymentsOnly = false;
      kind = 'all';
    }
  });

  function isPending(transaction: WalletTransaction): boolean {
    return ['pending', 'processing'].includes(transaction.status.toLowerCase());
  }

  function amount(transaction: WalletTransaction): number {
    return transaction.kind === 'deposit' ? -transaction.amount : transaction.amount;
  }

  function changeActivity(showPayments: boolean): void {
    paymentsOnly = showPayments;
    kind = 'all';
    filterOpen = false;
  }
</script>

<div class="card-overview">
  <div class="width heading">
    <div class="card-name">
      <h1>{cardName}</h1>
      {#if ending}<span>…{ending}</span>{/if}
    </div>
    <nav aria-label="Credit card sections">
      <button aria-current="page" disabled>Overview</button>
      <button onclick={onBills}>Payments</button>
      <button onclick={onDetails}>Card details</button>
      <button onclick={onDetails}>Rewards &amp; benefits</button>
    </nav>
  </div>
</div>
<section class="balance-band" aria-label="Card balance">
  <div class="width balance-summary">
    <button class="view-details" onclick={onDetails}>ⓘ View details</button>
    <div class="balance">
      <span>Current balance</span>
      <strong aria-label={money(account.balance, { decimals: 2 })}>{dollars}<sup>{cents}</sup></strong>
    </div>
    <button class="outline payments" onclick={onBills}>View scheduled payments</button>
    <div class="rewards">
      <span>{account.rewards.toLocaleString('en-US')} rewards points</span>
      <button class="outline" onclick={onDetails}>View rewards</button>
    </div>
  </div>
</section>

<section class="width activity" aria-label="Card activity">
  <div class="toolbar">
    <label class="search">
      <span aria-hidden="true">⌕</span>
      <input type="search" bind:value={query} aria-label="Search/filter transactions" placeholder="Search/filter transactions" />
    </label>
    {#if !paymentsOnly}
      <button class="filter-button" aria-expanded={filterOpen} onclick={() => (filterOpen = !filterOpen)}>
        Filter{kind === 'all' ? '' : ' (1)'}
      </button>
    {/if}
  </div>
  {#if filterOpen}
    <label class="filter-options">
      Transaction type
      <select bind:value={kind}>
        <option value="all">All transactions</option>
        <option value="deposit">Payments</option>
        <option value="withdrawal">Purchases</option>
      </select>
    </label>
  {/if}
  <div class="activity-tabs" aria-label="Transaction views">
    <button aria-pressed={!paymentsOnly} onclick={() => changeActivity(false)}>All Transactions</button>
    <button aria-pressed={paymentsOnly} onclick={() => changeActivity(true)}>Payment Activity</button>
  </div>

  {#if scheduled.length > 0}
    <section class="transaction-group" aria-label="Scheduled Payments">
      <h2>Scheduled Payments</h2>
      <div class="rows">
        {#each scheduled as bill (bill.id)}
          <button class="row" onclick={() => onBill(bill)}>
            {@render rowDate(bill.upcomingDate)}
            {@render description(bill.payee || bill.nickname || 'Scheduled payment', true)}
            <span class="category">{bill.status}</span>
            <span class="card-column"></span>
            <span class="amount">{money(-bill.amount, { decimals: 2 })}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {@render transactionGroup('Pending Transactions', pending, true)}
  {@render transactionGroup(paymentsOnly ? 'Posted Payments' : 'Posted Transactions', posted, false)}
  {#if scheduled.length === 0 && matching.length === 0}
    <p class="empty">No {paymentsOnly ? 'payments' : 'transactions'} to show.</p>
  {/if}
</section>

{#snippet rowDate(date: string)}
  {@const [month, day] = dateLabel(date).split(' ')}
  <span class="date">{month}{#if day}<strong>{day.padStart(2, '0')}</strong>{/if}</span>
{/snippet}

{#snippet description(name: string, payment: boolean)}
  <span class="description">
    <span class="transaction-icon" aria-hidden="true">
      {#if payment}↻{:else}▤{/if}
    </span>
    <span>{name}</span>
  </span>
{/snippet}

{#snippet transactionGroup(title: string, rows: WalletTransaction[], isPendingGroup: boolean)}
  {#if rows.length > 0}
    <section class="transaction-group" aria-label={title}>
      <h2>{title}</h2>
      <div class="columns" aria-hidden="true">
        <span>Date</span><span>Description</span><span class="category">Category</span><span class="card-column">Card</span><span>Amount</span>
      </div>
      <div class="rows">
        {#each rows as transaction (transaction.id)}
          <button
            class="row"
            class:pending={isPendingGroup}
            class:highlight={highlightId === transaction.id}
            data-transaction-id={transaction.id}
            onclick={() => onTransaction(transaction)}
          >
            {#if isPendingGroup}<span class="pending-label">Pending</span>{:else}{@render rowDate(transaction.date)}{/if}
            {@render description(transaction.description || 'Transaction', transaction.kind === 'deposit')}
            <span class="category">{transaction.kind === 'deposit' ? 'Payment' : 'Purchase'}</span>
            <span class="card-column">{cardLabel || '—'}</span>
            <span class="amount">{money(amount(transaction), { decimals: 2 })}</span>
          </button>
        {/each}
        <div class="total">Total <span>{money(rows.reduce((sum, transaction) => sum + amount(transaction), 0), { decimals: 2 })}</span></div>
      </div>
    </section>
  {/if}
{/snippet}

<style>
  .width { box-sizing: border-box; width: min(1170px, calc(100% - 32px)); margin-inline: auto; }
  button, input, select { font: inherit; color: inherit; }
  button { cursor: pointer; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
  .card-overview { background: #422013; color: #fff; }
  .heading { padding: 15px 22px 0; }
  .card-name { display: flex; align-items: center; gap: 20px; }
  .card-name h1 { font-size: clamp(28px, 4vw, 42px); font-weight: 680; letter-spacing: -.04em; margin: 0; }
  .card-name span { white-space: nowrap; }
  nav { display: flex; gap: 22px; overflow-x: auto; }
  nav button { flex: none; padding: 12px 6px 13px; border: 0; border-bottom: 4px solid transparent; background: transparent; color: #e0c5b9; font-weight: 600; }
  nav button:hover, nav button[aria-current] { color: #fff; }
  nav button[aria-current] { border-bottom-color: #fff; cursor: default; }
  .balance-band { background: linear-gradient(110deg, #aa5332, #883e26); color: #fff; }
  .balance-summary { display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: center; padding: 26px 16px 24px; min-height: 310px; }
  .view-details { grid-column: 2; justify-self: center; border: 0; background: transparent; font-size: 12px; text-transform: uppercase; }
  .view-details:hover { text-decoration: underline; }
  .balance { grid-column: 1; grid-row: 2; }
  .balance > span, .rewards > span { display: block; margin-bottom: 7px; font-size: 12px; text-transform: uppercase; letter-spacing: .035em; }
  .balance strong { display: block; font-size: clamp(42px, 6vw, 62px); font-weight: 300; line-height: 1; letter-spacing: -.045em; }
  .balance sup { font-size: .48em; vertical-align: super; letter-spacing: normal; margin-left: 3px; }
  .outline { width: 230px; max-width: 100%; border: 2px solid #fff; border-radius: 4px; background: transparent; padding: 8px 10px; font-size: 17px; }
  .outline:hover { background: #ffffff19; }
  .payments { grid-column: 3; grid-row: 2; justify-self: end; }
  .rewards { grid-column: 1; grid-row: 3; align-self: end; }
  .activity { padding: 24px 6px 50px; }
  .toolbar { display: flex; gap: 16px; }
  .search, .filter-button, .filter-options {
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 4px;
    box-shadow: 0 1px 4px #0002;
  }
  .search { flex: 1; display: flex; gap: 12px; min-width: 0; align-items: center; padding-left: 14px; }
  .search span { font-size: 25px; line-height: 1; }
  .search input { width: 100%; min-height: 46px; padding: 8px 12px 8px 0; border: 0; background: transparent; }
  .filter-button { min-width: 175px; padding: 8px 16px; color: var(--link); font-weight: 600; }
  .filter-options { display: flex; align-items: center; gap: 12px; margin-top: 10px; padding: 12px; }
  .filter-options select { padding: 5px; background: var(--surface); border: 1px solid var(--border); }
  .activity-tabs { display: flex; margin: 20px 0 34px; }
  .activity-tabs button { border: 0; padding: 0 7px; background: transparent; color: var(--link); }
  .activity-tabs button:first-child { padding-left: 0; border-right: 1px solid var(--ink); }
  .activity-tabs button[aria-pressed='true'] { color: var(--ink); }
  .transaction-group { margin-bottom: 36px; }
  .transaction-group h2 { margin: 0 0 12px; font-size: 18px; font-weight: 500; }
  .columns, .row { display: grid; grid-template-columns: 13% 41% 16% 17% 13%; align-items: center; text-align: left; }
  .columns { padding: 0 18px 5px 12px; color: var(--link); font-size: 11px; font-weight: 650; text-transform: uppercase; }
  .columns > :first-child { text-align: center; }
  .columns > :nth-child(2) { padding-left: 72px; }
  .columns > :last-child { text-align: right; }
  .rows, .empty { background: var(--surface); border: 1px solid var(--border); border-radius: 4px; box-shadow: 0 1px 4px #0002; }
  .row { position: relative; width: 100%; min-height: 76px; padding: 10px 18px 10px 12px; border: 0; border-bottom: 1px solid var(--border); background: transparent; }
  .row:last-child { border-bottom: 0; }
  .row::before { content: ''; position: absolute; width: 6px; height: 6px; top: calc(50% - 4px); left: 12px; border: solid currentColor; border-width: 0 1px 1px 0; transform: rotate(-45deg); }
  .row:hover, .highlight { background: var(--banner); }
  .date { display: grid; justify-items: center; font-size: 13px; }
  .date strong { font-size: 23px; font-weight: 450; line-height: 1.25; }
  .description { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 16px; align-items: center; padding-right: 10px; font-size: 18px; overflow-wrap: anywhere; }
  .transaction-icon { place-self: center; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: #72777b; color: #fff; font-size: 17px; font-style: normal; }
  .amount { text-align: right; font-size: 17px; font-variant-numeric: tabular-nums; }
  .pending { color: var(--muted); font-style: italic; }
  .pending-label { justify-self: center; padding: 6px 12px; background: var(--page); font-size: 12px; font-style: normal; }
  .total { padding: 12px 18px; text-align: right; font-size: 17px; }
  .total span { margin-left: 10px; }
  .empty { padding: 20px; }
  @media (max-width: 720px) {
    .heading { padding-inline: 0; }
    nav { gap: 10px; }
    .balance-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; min-height: 255px; padding-inline: 0; }
    .view-details { grid-column: 1 / -1; }
    .payments { grid-column: 2; }
    .outline { font-size: 14px; }
    .activity { padding-inline: 0; }
    .toolbar { gap: 8px; }
    .filter-button { min-width: auto; }
    .columns, .row { grid-template-columns: minmax(64px, 18%) 1fr auto; padding-inline: 8px; }
    .row::before { display: none; }
    .category, .card-column, .transaction-icon { display: none; }
    .description { display: block; font-size: 15px; padding-inline: 8px; }
    .columns > :nth-child(2) { padding-left: 8px; }
    .amount { font-size: 15px; }
    .pending-label { padding-inline: 6px; }
  }
</style>
