<script lang="ts">
  import { money, dateLabel } from '$lib/format';
  import {
    accountBalanceLabel,
    accountEnding,
    isCredit,
    type WalletAccount,
    type WalletBill,
    type WalletCustomer,
    type WalletLoan,
    type WalletTransaction
  } from '$lib/wallet';
  import DetailSheet from './DetailSheet.svelte';

  type Tab = 'activity' | 'details' | 'bills' | 'loans';
  type ActivityFilter = 'all' | 'deposits' | 'withdrawals';

  interface Props {
    accountId: string;
    initialTab: Tab;
  }

  interface DetailPayload {
    account?: WalletAccount;
    customer?: WalletCustomer;
    transactions?: WalletTransaction[];
    bills?: WalletBill[];
    loans?: WalletLoan[];
  }

  let { accountId, initialTab }: Props = $props();

  let tab = $state<Tab>('activity');
  let filter = $state<ActivityFilter>('all');
  let account = $state<WalletAccount | null>(null);
  let customer = $state<WalletCustomer | null>(null);
  let transactions = $state<WalletTransaction[]>([]);
  let bills = $state<WalletBill[]>([]);
  let loans = $state<WalletLoan[]>([]);
  let loading = $state(true);
  let error = $state('');
  let requestSeq = 0;
  let selectedTransaction = $state<WalletTransaction | null>(null);
  let selectedBill = $state<WalletBill | null>(null);
  let selectedLoan = $state<WalletLoan | null>(null);

  let credit = $derived(isCredit(account?.type ?? ''));
  let heroKind = $derived(
    account
      ? isCredit(account.type)
        ? 'credit'
        : account.type.toLowerCase().includes('savings')
          ? 'savings'
          : 'checking'
      : 'checking'
  );
  let filteredTransactions = $derived(
    transactions.filter((transaction) =>
      filter === 'all'
        ? true
        : filter === 'deposits'
          ? transaction.kind === 'deposit'
          : transaction.kind === 'withdrawal'
    )
  );
  let groupedTransactions = $derived(groupByDate(filteredTransactions));
  let customerAddress = $derived(formatAddress(customer));
  let balanceText = $derived(account ? money(account.balance, { decimals: 2 }) : '');
  let ending = $derived(account ? accountEnding(account) : '');

  function formatAddress(value: WalletCustomer | null): string {
    if (!value?.address) return '—';
    const { street, city, state, zip } = value.address;
    const region = [state, zip].filter(Boolean).join(' ');
    const cityLine = [city, region].filter(Boolean).join(', ');
    return [street, cityLine].filter(Boolean).join(', ') || '—';
  }

  function groupByDate(rows: WalletTransaction[]): Array<[string, WalletTransaction[]]> {
    const groups = new Map<string, WalletTransaction[]>();
    for (const transaction of rows) {
      const list = groups.get(transaction.date);
      if (list) list.push(transaction);
      else groups.set(transaction.date, [transaction]);
    }
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  }

  function signedAmount(transaction: WalletTransaction): string {
    const positive = credit ? transaction.kind === 'withdrawal' : transaction.kind === 'deposit';
    return `${positive ? '+' : '−'}${money(transaction.amount, { decimals: 2 })}`;
  }

  function transactionLabel(kind: 'deposit' | 'withdrawal'): string {
    return credit ? kind === 'deposit' ? 'Payment' : 'Purchase' : kind === 'deposit' ? 'Deposit' : 'Withdrawal';
  }

  function label(value: string | number | undefined | null): string {
    if (value === undefined || value === null || value === '') return '—';
    return String(value);
  }

  async function load(id: string): Promise<void> {
    const seq = ++requestSeq;
    loading = true;
    error = '';
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error('Account request failed');
      const payload = (await response.json()) as DetailPayload;
      if (seq !== requestSeq) return;
      account = payload.account ?? null;
      customer = payload.customer ?? null;
      transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
      bills = Array.isArray(payload.bills) ? payload.bills : [];
      loans = Array.isArray(payload.loans) ? payload.loans : [];
    } catch {
      if (seq === requestSeq) error = "We couldn't load this account.";
    } finally {
      if (seq === requestSeq) loading = false;
    }
  }

  $effect(() => {
    const id = accountId;
    const startTab = initialTab;
    if (!id) return;
    tab = startTab;
    filter = 'all';
    selectedTransaction = null;
    selectedBill = null;
    selectedLoan = null;
    void load(id);
  });
</script>

{#if loading && !account}
  <section class="state-card" aria-live="polite">
    <p>Loading account…</p>
  </section>
{:else if error && !account}
  <section class="state-card" aria-live="polite">
    <p>{error}</p>
    <button class="primary" onclick={() => void load(accountId)}>Retry</button>
  </section>
{:else if account}
  <section class="hero {heroKind}" aria-label={`${account.nickname || account.type} account`}>
    <div class="hero-top">
      <div>
        <p class="hero-kicker">{account.type}</p>
        <h2>{account.nickname || account.type}</h2>
        <p class="hero-ending">•••• {ending}</p>
      </div>
      {#if credit || account.rewards > 0}
        <p class="hero-rewards">{account.rewards.toLocaleString('en-US')} pts</p>
      {/if}
    </div>
    <div class="hero-balance">
      <small>{accountBalanceLabel(account.type)}</small>
      <strong>{balanceText}</strong>
    </div>
  </section>

  <div class="tabs" aria-label="Account sections">
    <button class="tab" aria-pressed={tab === 'activity'} onclick={() => (tab = 'activity')}>
      Activity <span>{transactions.length}</span>
    </button>
    <button class="tab" aria-pressed={tab === 'details'} onclick={() => (tab = 'details')}>
      Details
    </button>
    <button class="tab" aria-pressed={tab === 'bills'} onclick={() => (tab = 'bills')}>
      Bills <span>{bills.length}</span>
    </button>
    <button class="tab" aria-pressed={tab === 'loans'} onclick={() => (tab = 'loans')}>
      Loans <span>{loans.length}</span>
    </button>
  </div>

  {#if tab === 'activity'}
    <section class="tab-panel" aria-label="Activity">
      <div class="filters" aria-label="Filter transactions">
        <button aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
        <button aria-pressed={filter === 'deposits'} onclick={() => (filter = 'deposits')}>{credit ? 'Payments' : 'Deposits'}</button>
        <button aria-pressed={filter === 'withdrawals'} onclick={() => (filter = 'withdrawals')}>{credit ? 'Purchases' : 'Withdrawals'}</button>
      </div>

      {#if groupedTransactions.length === 0}
        <p class="empty">No transactions to show.</p>
      {:else}
        {#each groupedTransactions as [date, rows] (date)}
          <section class="date-group">
            <h3>{dateLabel(date)}</h3>
            <div class="rows">
              {#each rows as transaction (transaction.id)}
                <button class="tx-row" onclick={() => (selectedTransaction = transaction)}>
                  <span class="tx-main">
                    <strong>{transaction.description || 'Transaction'}</strong>
                    <small>{transactionLabel(transaction.kind)} · {label(transaction.status)}</small>
                    {#if transaction.demoImpact}<small class="impact-label" class:green-impact={transaction.demoImpact === 'green'}>{transaction.demoImpact === 'green' ? 'Green demo purchase' : 'Non-green demo purchase'}</small>{/if}
                  </span>
                  <span class="tx-amount" class:deposit={transaction.kind === 'deposit'}>
                    {signedAmount(transaction)}
                    {#if transaction.balanceAfter !== undefined}
                      <small>{credit ? 'Balance owed' : 'Balance'} {money(transaction.balanceAfter, { decimals: 2 })}</small>
                    {/if}
                  </span>
                </button>
              {/each}
            </div>
          </section>
        {/each}
      {/if}
    </section>
  {:else if tab === 'details'}
    <section class="tab-panel" aria-label="Details">
      <dl class="detail-list">
        <div><dt>Account type</dt><dd>{label(account.type)}</dd></div>
        <div><dt>Nickname</dt><dd>{label(account.nickname)}</dd></div>
        <div><dt>Account number</dt><dd>•••• {ending}</dd></div>
        <div><dt>{accountBalanceLabel(account.type)}</dt><dd>{balanceText}</dd></div>
        {#if credit || account.rewards > 0}<div><dt>Rewards points</dt><dd>{account.rewards.toLocaleString('en-US')}</dd></div>{/if}
        <div><dt>Account holder</dt><dd>{customer ? `${customer.firstName} ${customer.lastName}`.trim() : '—'}</dd></div>
        <div><dt>Address</dt><dd>{customerAddress}</dd></div>
      </dl>
    </section>
  {:else if tab === 'bills'}
    <section class="tab-panel" aria-label="Bills">
      {#if bills.length === 0}
        <p class="empty">No bills for this account.</p>
      {:else}
        <div class="rows">
          {#each bills as bill (bill.id)}
            <button class="list-row" onclick={() => (selectedBill = bill)}>
              <span class="list-main">
                <strong>{bill.payee || bill.nickname || 'Bill'}</strong>
                <small>{label(bill.nickname)} · Due {dateLabel(bill.upcomingDate)}</small>
              </span>
              <span class="list-side">
                <strong>{money(bill.amount, { decimals: 2 })}</strong>
                <small>{label(bill.status)}</small>
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </section>
  {:else}
    <section class="tab-panel" aria-label="Loans">
      {#if loans.length === 0}
        <p class="empty">No loans for this account.</p>
      {:else}
        <div class="rows">
          {#each loans as loan (loan.id)}
            <button class="list-row" onclick={() => (selectedLoan = loan)}>
              <span class="list-main">
                <strong>{label(loan.type)}</strong>
                <small>{label(loan.description)}</small>
              </span>
              <span class="list-side">
                <strong>{money(loan.amount, { decimals: 2 })}</strong>
                <small>{money(loan.monthlyPayment, { decimals: 2 })}/mo · {label(loan.status)}</small>
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
{/if}

{#if selectedTransaction}
  <DetailSheet title="Transaction" onClose={() => (selectedTransaction = null)}>
    <dl class="detail-list">
      <div><dt>Date</dt><dd>{dateLabel(selectedTransaction.date)}</dd></div>
      <div><dt>Description</dt><dd>{label(selectedTransaction.description)}</dd></div>
      <div><dt>Type</dt><dd>{transactionLabel(selectedTransaction.kind)}</dd></div>
      <div><dt>Status</dt><dd>{label(selectedTransaction.status)}</dd></div>
      <div><dt>Amount</dt><dd>{signedAmount(selectedTransaction)}</dd></div>
      <div><dt>Medium</dt><dd>{label(selectedTransaction.medium)}</dd></div>
      {#if selectedTransaction.balanceAfter !== undefined}
        <div><dt>Balance after</dt><dd>{money(selectedTransaction.balanceAfter, { decimals: 2 })}</dd></div>
      {/if}
      <div><dt>Transaction ID</dt><dd class="mono">{label(selectedTransaction.id)}</dd></div>
    </dl>
  </DetailSheet>
{/if}

{#if selectedBill}
  <DetailSheet title="Bill" onClose={() => (selectedBill = null)}>
    <dl class="detail-list">
      <div><dt>Payee</dt><dd>{label(selectedBill.payee)}</dd></div>
      <div><dt>Nickname</dt><dd>{label(selectedBill.nickname)}</dd></div>
      <div><dt>Amount</dt><dd>{money(selectedBill.amount, { decimals: 2 })}</dd></div>
      <div><dt>Due date</dt><dd>{dateLabel(selectedBill.upcomingDate)}</dd></div>
      <div><dt>Payment date</dt><dd>{label(selectedBill.paymentDate)}</dd></div>
      <div><dt>Recurring day</dt><dd>{label(selectedBill.recurringDay)}</dd></div>
      <div><dt>Status</dt><dd>{label(selectedBill.status)}</dd></div>
      <div><dt>Account ID</dt><dd class="mono">{label(selectedBill.accountId)}</dd></div>
    </dl>
  </DetailSheet>
{/if}

{#if selectedLoan}
  <DetailSheet title="Loan" onClose={() => (selectedLoan = null)}>
    <dl class="detail-list">
      <div><dt>Type</dt><dd>{label(selectedLoan.type)}</dd></div>
      <div><dt>Amount</dt><dd>{money(selectedLoan.amount, { decimals: 2 })}</dd></div>
      <div><dt>Monthly payment</dt><dd>{money(selectedLoan.monthlyPayment, { decimals: 2 })}</dd></div>
      <div><dt>Credit score</dt><dd>{label(selectedLoan.creditScore)}</dd></div>
      <div><dt>Status</dt><dd>{label(selectedLoan.status)}</dd></div>
      <div><dt>Description</dt><dd>{label(selectedLoan.description)}</dd></div>
      <div><dt>Creation date</dt><dd>{label(selectedLoan.creationDate)}</dd></div>
      <div><dt>Account ID</dt><dd class="mono">{label(selectedLoan.accountId)}</dd></div>
    </dl>
  </DetailSheet>
{/if}

<style>
  .state-card {
    display: grid;
    gap: 12px;
    justify-items: start;
    padding: 24px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
  }
  .hero {
    display: grid;
    gap: 24px;
    padding: 22px;
    border-radius: 18px;
    color: #fff;
    background: linear-gradient(118deg, #062f4c, #126379);
    box-shadow: var(--shadow);
  }
  .hero.savings { background: linear-gradient(118deg, #202c47, #485875); }
  .hero.credit { background: linear-gradient(118deg, #5b2a24, #a74829); }
  .hero-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .hero-kicker {
    margin: 0 0 4px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    opacity: .75;
  }
  .hero h2 { margin: 0; font-size: 22px; line-height: 1.25; }
  .hero-ending { margin: 3px 0 0; font-size: 12px; opacity: .78; }
  .tx-main .impact-label { color: var(--muted); font-size: 10px; }.tx-main .green-impact { color: var(--dark, #9eddb3) var(--light, #286b41); }
  .hero-rewards { margin: 0; font-size: 13px; font-weight: 650; }
  .hero-balance { display: grid; gap: 2px; }
  .hero-balance small { font-size: 12px; opacity: .78; }
  .hero-balance strong { font-size: clamp(28px, 5vw, 38px); line-height: 1; font-weight: 450; letter-spacing: -.04em; }

  .tabs {
    display: flex;
    gap: 4px;
    margin-top: 18px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    overflow-x: auto;
  }
  .tab {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-height: 36px;
    padding: 6px 10px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
    font-weight: 650;
    white-space: nowrap;
  }
  .tab span { font-size: 11px; font-weight: 500; }
  .tab[aria-pressed='true'] { background: var(--banner); color: var(--ink); }
  .tab-panel { margin-top: 18px; display: grid; gap: 14px; }
  .filters { display: flex; gap: 6px; flex-wrap: wrap; }
  .filters button {
    padding: 6px 11px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--page);
    color: var(--muted);
    font-size: 12px;
    font-weight: 650;
  }
  .filters button[aria-pressed='true'] { background: var(--button); border-color: var(--button); color: var(--button-text); }
  .date-group { display: grid; gap: 6px; }
  .date-group h3 {
    margin: 0;
    padding: 0 2px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .rows { display: grid; gap: 6px; }
  .tx-row, .list-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    width: 100%;
    padding: 11px 13px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--ink);
    text-align: left;
  }
  .tx-row:hover, .list-row:hover { background: var(--page); }
  .tx-main, .list-main, .tx-amount, .list-side { display: grid; gap: 2px; min-width: 0; }
  .tx-main strong, .list-main strong { font-size: 14px; font-weight: 600; }
  .tx-main small, .list-main small, .tx-amount small, .list-side small { color: var(--muted); font-size: 11px; }
  .tx-amount, .list-side { justify-items: end; text-align: right; flex: none; }
  .tx-amount { font-weight: 650; }
  .tx-amount.deposit { color: #568825; }
  .list-side strong { font-size: 14px; }
  .empty {
    padding: 22px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    color: var(--muted);
  }
  .detail-list {
    display: grid;
    gap: 0;
    margin: 0;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    overflow: hidden;
  }
  .detail-list > div {
    display: grid;
    grid-template-columns: minmax(120px, .7fr) minmax(0, 1.3fr);
    gap: 12px;
    padding: 11px 14px;
    border-bottom: 1px solid var(--border);
  }
  .detail-list > div:last-child { border-bottom: 0; }
  .detail-list dt { color: var(--muted); font-size: 12px; }
  .detail-list dd { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
  .primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 9px 13px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: var(--button);
    color: var(--button-text);
    font-size: 13px;
    font-weight: 650;
  }
  @media (max-width: 570px) {
    .hero { padding: 18px; }
    .hero-top { flex-direction: column; gap: 6px; }
    .tab { font-size: 12px; padding-inline: 8px; }
    .detail-list > div { grid-template-columns: 1fr; gap: 2px; }
  }
</style>
