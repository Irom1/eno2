<script lang="ts">
  import { accountProduct } from '$lib/products';
  import { tick, type Snippet } from 'svelte';
  import { money, dateLabel } from '$lib/format';
  import {
    accountBalanceLabel,
    accountEnding,
    isCredit,
    upcomingBills,
    type WalletAccount,
    type WalletBill,
    type WalletCustomer,
    type WalletTransaction
  } from '$lib/wallet';
  import {
    FRESH_MS,
    STALE_MS,
    accountCacheKey,
    readWalletCache,
    writeWalletCache
  } from '$lib/walletCache';
  import DetailSheet from './DetailSheet.svelte';
  import { fetchWithSession } from '$lib/sessionRecovery';

  type Tab = 'activity' | 'details' | 'bills';
  type ActivityFilter = 'all' | 'deposits' | 'withdrawals';

  interface Props {
    accountId: string;
    tab: Tab;
    heading: Snippet;
    onTabChange: (tab: Tab) => void;
    customerId?: string;
    focusTransactionId?: string;
    focusBillId?: string;
    onAccountDeleted: (accountId: string) => void;
  }

  interface DetailPayload {
    account?: WalletAccount;
    customer?: WalletCustomer;
    transactions?: WalletTransaction[];
    bills?: WalletBill[];
  }

  let { accountId, tab, heading, onTabChange, customerId = '', focusTransactionId, focusBillId, onAccountDeleted }: Props = $props();

  let query = $state('');
  let filter = $state<ActivityFilter>('all');
  let account = $state<WalletAccount | null>(null);
  let customer = $state<WalletCustomer | null>(null);
  let transactions = $state<WalletTransaction[]>([]);
  let bills = $state<WalletBill[]>([]);
  let loading = $state(true);
  let error = $state('');
  let requestSeq = 0;
  let selectedTransaction = $state<WalletTransaction | null>(null);
  let selectedBill = $state<WalletBill | null>(null);
  let highlightId = $state('');
  let highlightBillId = $state('');
  let deleteDialog: HTMLDialogElement;
  let cancelDeleteButton: HTMLButtonElement;
  let deleting = $state(false);
  let deleteError = $state('');

  let credit = $derived(isCredit(account?.type ?? ''));
  let product = $derived(accountProduct(account?.type, account?.nickname));
  let productName = $derived(product?.name ?? (account?.nickname || account?.type || 'Account'));
  let searchTerm = $derived(query.trim().toLowerCase());
  let filteredTransactions = $derived(transactions.filter((transaction) =>
    transaction.description.toLowerCase().includes(searchTerm) &&
    (filter === 'all' || transaction.kind === (filter === 'deposits' ? 'deposit' : 'withdrawal'))
  ));
  let groupedTransactions = $derived(groupByDate(filteredTransactions));
  let scheduledPayments = $derived(credit && filter !== 'withdrawals'
    ? upcomingBills(bills).filter((bill) => `${bill.payee} ${bill.nickname}`.toLowerCase().includes(searchTerm))
    : []);
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

  function confirmAccountDeletion(): void {
    deleteError = '';
    deleteDialog.showModal();
    cancelDeleteButton.focus();
  }

  async function deleteAccount(): Promise<void> {
    if (deleting || account?.id !== accountId) return;
    const id = accountId;
    deleting = true;
    deleteError = '';
    try {
      const response = await fetchWithSession(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }, customerId);
      if (response.status !== 204) throw new Error('Deletion was not confirmed');
      onAccountDeleted(id);
    } catch {
      deleteError = "We couldn't confirm the deletion. Close this dialog and refresh the dashboard to check whether the account is still there.";
    } finally {
      deleting = false;
    }
  }

  /** Apply a validated detail payload to the account view. */
  function applyDetail(payload: DetailPayload, id: string): boolean {
    if (payload.account?.id && payload.account.id !== id) return false;
    account = payload.account ?? null;
    customer = payload.customer ?? null;
    transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
    bills = Array.isArray(payload.bills) ? payload.bills : [];
    return true;
  }

  async function load(id: string): Promise<void> {
    const seq = ++requestSeq;
    error = '';
    const key = accountCacheKey(id);

    // A fresh cache is enough for the deep link: apply it and skip the fetch.
    const fresh = readWalletCache<DetailPayload>(key, FRESH_MS);
    if (fresh && applyDetail(fresh, id)) {
      loading = false;
      return;
    }

    // A stale cache paints immediately; revalidate in the background.
    const stale = readWalletCache<DetailPayload>(key, STALE_MS);
    const showingCache = Boolean(stale && applyDetail(stale, id));
    loading = !showingCache;

    try {
      const response = await fetchWithSession(`/api/accounts/${encodeURIComponent(id)}`, undefined, customerId);
      if (!response.ok) throw new Error('Account request failed');
      const payload = (await response.json()) as DetailPayload;
      if (seq !== requestSeq) return;
      if (applyDetail(payload, id)) writeWalletCache(key, payload);
    } catch {
      if (seq === requestSeq && !showingCache) error = "We couldn't load this account.";
    } finally {
      if (seq === requestSeq) loading = false;
    }
  }

  $effect(() => {
    const id = accountId;
    if (!id) return;
    query = '';
    filter = 'all';
    selectedTransaction = null;
    selectedBill = null;
    highlightId = '';
    highlightBillId = '';
    void load(id);
  });

  $effect(() => {
    highlightId = '';
    if (focusTransactionId) {
      query = '';
      filter = 'all';
    }
  });

  $effect(() => {
    highlightBillId = '';
    const focus = focusBillId ?? '';
    if (focus && tab === 'bills') {
      // Focus is applied by the scroll effect once bills have loaded.
    }
  });

  $effect(() => {
    const focus = focusTransactionId ?? '';
    const currentTab = tab;
    const isLoading = loading;
    const rows = transactions;
    if (!focus || currentTab !== 'activity' || isLoading) return;
    if (!rows.some((transaction) => transaction.id === focus)) return;

    let cancelled = false;
    void tick().then(() => {
      if (cancelled) return;
      const row = document.querySelector<HTMLElement>(
        `[data-transaction-id="${CSS.escape(focus)}"]`
      );
      if (!row) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      row.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      highlightId = focus;
    });

    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    const focus = focusBillId ?? '';
    const currentTab = tab;
    const isLoading = loading;
    const rows = bills;
    if (!focus || currentTab !== 'bills' || isLoading) return;
    if (!rows.some((bill) => bill.id === focus)) return;

    let cancelled = false;
    void tick().then(() => {
      if (cancelled) return;
      const row = document.querySelector<HTMLElement>(
        `[data-bill-id="${CSS.escape(focus)}"]`
      );
      if (!row) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      row.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      highlightBillId = focus;
    });

    return () => {
      cancelled = true;
    };
  });
</script>

<header class="hero" class:pending={!account} data-full-width style:--product-gradient={product?.gradient} style:--product-ink={product?.ink}>
  {@render heading()}
  {#if account}
    <div class="hero-top">
      <div>
        <p class="hero-kicker">{account.type}</p>
        <h2>{productName}</h2>
        <p class="hero-ending">•••• {ending}</p>
      </div>
      {#if credit}
        <p class="hero-rewards">{account.rewards.toLocaleString('en-US')} pts</p>
      {/if}
    </div>
    <div class="hero-balance">
      <small>{accountBalanceLabel(account.type)}</small>
      <strong>{balanceText}</strong>
    </div>
  {/if}
</header>

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
  <div class="tabs" aria-label="Account sections">
    <button class="tab" aria-pressed={tab === 'activity'} onclick={() => onTabChange('activity')}>
      Activity <span>{transactions.length}</span>
    </button>
    <button class="tab" aria-pressed={tab === 'details'} onclick={() => onTabChange('details')}>
      Details
    </button>
    <button class="tab" aria-pressed={tab === 'bills'} onclick={() => onTabChange('bills')}>
      Bills <span>{bills.length}</span>
    </button>
  </div>

  {#if tab === 'activity'}
    <section class="tab-panel" aria-label="Activity">
      <div class="activity-controls">
        <input type="search" bind:value={query} aria-label="Search transactions" placeholder="Search transactions" />
        <div class="filters" aria-label="Filter transactions">
          <button aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
          <button aria-pressed={filter === 'deposits'} onclick={() => (filter = 'deposits')}>{credit ? 'Payments' : 'Deposits'}</button>
          <button aria-pressed={filter === 'withdrawals'} onclick={() => (filter = 'withdrawals')}>{credit ? 'Purchases' : 'Withdrawals'}</button>
        </div>
      </div>

      {#if scheduledPayments.length}
        <section class="date-group" aria-label="Scheduled payments">
          <h3>Scheduled payments</h3>
          <div class="rows">
            {#each scheduledPayments as bill (bill.id)}
              {@render billRow(bill)}
            {/each}
          </div>
        </section>
      {/if}
      {#if groupedTransactions.length === 0 && scheduledPayments.length === 0}
        <p class="empty">{searchTerm ? 'No matching transactions.' : 'No transactions to show.'}</p>
      {:else}
        {#each groupedTransactions as [date, rows] (date)}
          <section class="date-group">
            <h3>{dateLabel(date)}</h3>
            <div class="rows">
              {#each rows as transaction (transaction.id)}
                <button
                  class="tx-row"
                  class:highlight={highlightId === transaction.id}
                  data-transaction-id={transaction.id}
                  onclick={() => (selectedTransaction = transaction)}
                >
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
        <div><dt>Product</dt><dd>{productName}</dd></div>
        <div><dt>Account number</dt><dd>•••• {ending}</dd></div>
        <div><dt>Account holder</dt><dd>{customer ? `${customer.firstName} ${customer.lastName}`.trim() : '—'}</dd></div>
        <div><dt>Address</dt><dd>{customerAddress}</dd></div>
      </dl>
      <div class="account-settings">
        <button class="danger-button" onclick={confirmAccountDeletion}>Delete account</button>
      </div>
    </section>
  {:else if tab === 'bills'}
    <section class="tab-panel" aria-label="Bills">
      {#if bills.length === 0}
        <p class="empty">No bills for this account.</p>
      {:else}
        <div class="rows">
          {#each bills as bill (bill.id)}
            {@render billRow(bill)}
          {/each}
        </div>
      {/if}
    </section>
  {/if}
{/if}

{#snippet billRow(bill: WalletBill)}
  <button
    class="list-row"
    class:highlight={highlightBillId === bill.id}
    data-bill-id={bill.id}
    onclick={() => (selectedBill = bill)}
  >
    <span class="list-main">
      <strong>{bill.payee || bill.nickname || 'Bill'}</strong>
      <small>{label(bill.nickname)} · Due {dateLabel(bill.upcomingDate)}</small>
    </span>
    <span class="list-side">
      <strong>{money(bill.amount, { decimals: 2 })}</strong>
      <small>{label(bill.status)}</small>
    </span>
  </button>
{/snippet}

<dialog
  class="delete-dialog"
  bind:this={deleteDialog}
  aria-labelledby="delete-account-title"
  aria-describedby="delete-account-description"
  oncancel={(event) => { if (deleting) event.preventDefault(); }}
  onkeydown={(event) => { if (event.key === 'Escape') event.stopPropagation(); }}
>
  <h2 id="delete-account-title">Delete account?</h2>
  <p id="delete-account-description">
    Delete <strong>{productName}</strong> ending in {ending}?
    This permanently removes the demo account. You can’t undo it.
  </p>
  {#if deleteError}<p role="alert">{deleteError}</p>{/if}
  <div class="delete-actions">
    <form method="dialog">
      <button class="cancel-button" bind:this={cancelDeleteButton} disabled={deleting}>Cancel</button>
    </form>
    <button class="danger-button" disabled={deleting || !!deleteError} onclick={deleteAccount}>
      {deleting ? 'Deleting account…' : 'Delete account'}
    </button>
  </div>
</dialog>

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

<style>
  .account-settings {
    display: grid;
    justify-items: start;
    gap: 12px;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  .delete-dialog h2 { font-size: 17px; }
  .delete-dialog {
    width: min(440px, calc(100% - 32px));
    margin: auto;
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
    color: var(--ink);
  }
  .delete-dialog::backdrop { background: var(--dark, #0009) var(--light, #0b182399); }
  .delete-dialog p { margin-top: 12px; }
  .delete-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 20px; }
  .danger-button, .cancel-button {
    padding: 9px 14px;
    border-radius: 8px;
    font-weight: 650;
  }
  .danger-button { border: 1px solid transparent; background: #a22731; color: white; }
  .cancel-button { border: 1px solid var(--border); background: var(--surface); color: var(--ink); }
  .delete-actions button:disabled { opacity: 0.65; cursor: default; }
  .state-card {
    display: grid;
    gap: 12px;
    justify-items: start;
    margin-top: 18px;
    padding: 24px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
  }
  .hero {
    display: grid;
    grid-template-columns: subgrid;
    row-gap: 24px;
    padding-block: clamp(20px, 4vw, 32px);
    color: var(--product-ink, #fff);
    background:
      url('/images/hero-grain.png') 0 0 / 128px 128px repeat,
      var(--product-gradient, linear-gradient(115deg, #252525, #484848));
    box-shadow: var(--shadow);
  }
  .hero.pending {
    color: var(--ink);
    background: var(--surface);
  }
  .hero-top, .hero-balance { grid-column: content; }
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
  .hero-rewards { margin: 0; padding: 6px 10px; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: 999px; font-size: 12px; font-weight: 650; text-align: right; }
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
  .activity-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
  .activity-controls input {
    flex: 1 1 220px;
    min-width: 0;
    max-width: 360px;
    min-height: 42px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
  }
  .activity-controls input::placeholder { color: var(--muted); }
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
  .tx-row.highlight,
  .tx-row.highlight:hover,
  .list-row.highlight,
  .list-row.highlight:hover {
    background: var(--dark, var(--banner)) var(--light, color-mix(in srgb, var(--link) 22%, transparent));
  }
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
    .hero { padding-block: 18px; }
    .hero-top { flex-direction: column; gap: 6px; }
    .tab { font-size: 12px; padding-inline: 8px; }
    .detail-list > div { grid-template-columns: 1fr; gap: 2px; }
  }
</style>
