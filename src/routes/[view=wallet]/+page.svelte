<script lang="ts">
  import DeleteCustomerButton from '$lib/components/DeleteCustomerButton.svelte';
  import CustomerRemovalNotice from '$lib/components/CustomerRemovalNotice.svelte';
  import { customerName } from '$lib/customerDeletion';
  import { demoCreditScore, creditScoreRating } from '$lib/creditWise';
  import { changeCustomerRemoval, lastRemovedCustomer, rememberRemovedCustomer, forgetRemovedCustomer, type RemovedCustomer } from '$lib/customerRemoval';
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount, tick } from 'svelte';
  import { GUEST_CUSTOMER_ID, OPEN_ACCOUNT_MESSAGE } from '$lib/chat/guest';
  import { dateLabel, money } from '$lib/format';
  import {
    accountEnding,
    accountKind,
    accountTint,
    formatAmount,
    isCredit,
    scheduledTotal,
    upcomingBills,
    type WalletAccount,
    type WalletBill,
    type WalletCustomer,
    type WalletLoan,
    type WalletTransaction
  } from '$lib/wallet';
  import AccountDetailView from './AccountDetailView.svelte';
  import ViewShell from './ViewShell.svelte';
  import ChatPanel from './ChatPanel.svelte';
  import CapitalOneLogo from './CapitalOneLogo.svelte';
  import ClimateWiseWidget from '$lib/climate/ClimateWiseWidget.svelte';

  type ChatPanelApi = { ask: (text: string) => Promise<void> };

  type Theme = 'light' | 'dark' | 'system';

  interface Customer {
    id: string;
    firstName: string;
    lastName: string;
    city?: string;
    state?: string;
    zip?: string;
  }

  const helpCenter = 'https://www.capitalone.com/help-center/';

  interface OverviewSnapshot {
    overview?: { totalRewards?: number } | null;
  }

  interface AccountsSnapshot {
    customer?: WalletCustomer;
    accounts?: WalletAccount[];
    bills?: WalletBill[];
    loans?: WalletLoan[];
    recentActivity?: WalletTransaction[];
  }

  type WalletTab = 'activity' | 'details' | 'bills' | 'loans';
  let theme = $state<Theme>('system');
  let systemPrefersDark = $state(false);
  let effectiveTheme = $derived(
    theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme
  );
  let isDark = $derived(effectiveTheme === 'dark');
  let accountOpen = $state(false);
  let accountButton = $state<HTMLButtonElement>();
  let accountMenuEl = $state<HTMLDivElement>();
  let customers = $state<Customer[]>([]);
  let activeCustomerId = $state('');
  let deletingId = $state('');
  let removalError = $state('');
  let removedCustomer = $state<RemovedCustomer | null>(null);
  let customersLoading = $state(true);
  let activeCustomer = $derived(
    customers.find((customer) => customer.id === activeCustomerId) ?? null
  );
  let activeName = $derived(
    activeCustomer ? `${activeCustomer.firstName} ${activeCustomer.lastName}`.trim() : ''
  );
  let activeInitial = $derived(activeCustomer?.firstName?.[0]?.toUpperCase() ?? 'A');
  let activeFirstName = $derived(activeCustomer?.firstName || 'Account');
  let creditScore = $derived(demoCreditScore(activeCustomerId));
  let creditRating = $derived(creditScoreRating(creditScore));
  let creditGaugeProgress = $derived(Math.max(2, (creditScore - 300) / 550 * 75));

  let liveCustomer = $state<WalletCustomer | null>(null);
  let liveAccounts = $state<WalletAccount[]>([]);
  let liveBills = $state<WalletBill[]>([]);
  let loans = $state<WalletLoan[]>([]);
  let recentActivity = $state<WalletTransaction[]>([]);
  let snapshotOverview = $state<OverviewSnapshot | null>(null);
  // Bumped after each successful load, so widgets that fetch their own data (ClimateWise) refetch for the new session.
  let snapshotVersion = $state(0);
  let snapshotLoading = $state(true);
  let snapshotError = $state('');
  let accountNotice = $state('');
  let closeProfileDialog: HTMLDialogElement;
  let cancelCloseProfile: HTMLButtonElement;
  let closingCustomer = $state<{ id: string; name: string } | null>(null);
  let closingProfile = $state(false);
  let closeProfileError = $state('');
  let snapshotSeq = 0;
  let walletView = $state<{ accountId: string; tab: WalletTab } | null>(null);
  let focusTransactionId = $state('');
  let deepLinkHandled = false;

  let displayAccounts = $derived.by(() => {
    const rank = (type: string): number => {
      const normalized = type.toLowerCase();
      if (normalized.includes('checking')) return 0;
      if (normalized.includes('savings')) return 1;
      if (normalized.includes('credit')) return 2;
      return 3;
    };
    return [...liveAccounts]
      .sort((a, b) => rank(a.type) - rank(b.type) || a.nickname.localeCompare(b.nickname))
      .map((account) => {
        const credit = isCredit(account.type);
        const scheduled = credit ? scheduledTotal(liveBills, account.id) : 0;
        return {
          id: account.id,
          name: account.nickname || account.type,
          ending: accountEnding(account),
          balance: formatAmount(account.balance),
          kind: accountKind(account.type),
          tint: accountTint(account.type),
          credit,
          scheduled:
            scheduled > 0
              ? `${money(scheduled, { decimals: 2 })} in scheduled payments`
              : undefined
        };
      });
  });

  let upcoming = $derived(upcomingBills(liveBills));
  let primaryCheckingId = $derived(
    liveAccounts.find((account) => account.type.toLowerCase().includes('checking'))?.id ??
      liveAccounts[0]?.id ??
      ''
  );
  let firstCredit = $derived(
    liveAccounts.find((account) => account.rewards > 0) ?? liveAccounts.find((account) => isCredit(account.type)) ?? null
  );
  let creditRewards = $derived(
    liveAccounts
      .reduce((sum, account) => sum + account.rewards, 0)
  );
  let rewardPoints = $derived(snapshotOverview?.overview?.totalRewards ?? creditRewards);

  function focusActiveOption(): void {
    const active = accountMenuEl?.querySelector<HTMLButtonElement>(
      '.account-option[aria-checked="true"]'
    );
    const first = accountMenuEl?.querySelector<HTMLButtonElement>('.account-option');
    (active ?? first)?.focus();
  }

  async function toggleAccountMenu(): Promise<void> {
    accountOpen = !accountOpen;
    await tick();
    if (accountOpen) focusActiveOption();
    else accountButton?.focus();
  }

  function closeAccountMenu(): void {
    accountOpen = false;
  }

  function handleMenuKeydown(event: KeyboardEvent): void {
    if (accountOpen && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      accountOpen = false;
      accountButton?.focus();
    }
  }

  function handleWindowClick(event: MouseEvent): void {
    if (!accountOpen) return;
    const target = event.target as Node | null;
    if (accountMenuEl && target && !accountMenuEl.contains(target)) {
      accountOpen = false;
    }
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && accountOpen) {
      event.preventDefault();
      closeAccountMenu();
      accountButton?.focus();
    }
  }

  async function selectCustomer(id: string): Promise<void> {
    activeCustomerId = id;
    accountNotice = '';
    accountOpen = false;
    walletView = null;
    await tick();
    accountButton?.focus();
    void loadSnapshot(id);
  }

  async function deleteCustomer(customer: Customer) {
    if (deletingId) return;
    deletingId = customer.id; removalError = '';
    try {
      await changeCustomerRemoval(customer.id, true);
      customers = customers.filter((item) => item.id !== customer.id);
      removedCustomer = rememberRemovedCustomer({ id: customer.id, name: customerName(customer) });
      if (activeCustomerId === customer.id) {
        const fallback = customers.find((item) => `${item.firstName} ${item.lastName}`.toLowerCase() === 'maya chen') ?? customers[0];
        if (!fallback) { await goto('/'); return; }
        await selectCustomer(fallback.id);
        const next = new URL(page.url); next.searchParams.set('customer', fallback.id);
        await goto(next.pathname + next.search + next.hash, { replaceState: true, keepFocus: true, noScroll: true });
        accountOpen = true;
      } else if (page.url.searchParams.get('customer') === customer.id) {
        const next = new URL(page.url); next.searchParams.set('customer', activeCustomerId);
        await goto(next.pathname + next.search + next.hash, { replaceState: true, keepFocus: true, noScroll: true });
      }
      await tick(); focusActiveOption();
    } catch (cause) { removalError = cause instanceof Error ? cause.message : 'Couldn’t delete this account.'; }
    finally { deletingId = ''; }
  }

  async function undoRemoval() {
    if (!removedCustomer || deletingId) return;
    const id = removedCustomer.id; deletingId = id; removalError = '';
    try {
      await changeCustomerRemoval(id, false);
      removedCustomer = forgetRemovedCustomer(id);
      await loadCustomers();
    } catch (cause) { removalError = cause instanceof Error ? cause.message : 'Couldn’t restore this account.'; }
    finally { deletingId = ''; }
  }

  async function loadCustomers() {
    try {
      const [response, sessionResponse] = await Promise.all([
        fetch('/api/customers'),
        fetch('/api/session').catch(() => null)
      ]);
      if (!response.ok) throw new Error('Could not load customers.');
      const payload = (await response.json()) as { customers?: Customer[] };
      const list = Array.isArray(payload.customers) ? payload.customers : [];
      const currentSession = sessionResponse?.ok
        ? await sessionResponse.json() as { customer?: Customer }
        : null;
      const requestedCustomerId = page.url.searchParams.get('customer') ||
        (currentSession?.customer?.id === GUEST_CUSTOMER_ID ? undefined : currentSession?.customer?.id);
      if (requestedCustomerId && !list.some((customer) => customer.id === requestedCustomerId)) {
        const selectedResponse = await fetch(`/api/customers?customer=${encodeURIComponent(requestedCustomerId)}`);
        if (!selectedResponse.ok) throw new Error('Could not load selected customer.');
        const selectedPayload = await selectedResponse.json() as { customers?: Customer[] };
        const selected = selectedPayload.customers?.find((customer) => customer.id === requestedCustomerId);
        if (!selected) throw new Error('Selected customer was not found.');
        list.push(selected);
      }
      customers = list;
      const preferred =
        list.find((customer) => customer.id === requestedCustomerId) ??
        list.find((customer) => customer.lastName === 'Chen') ??
        list[0];
      if (preferred) {
        activeCustomerId = preferred.id;
        void loadSnapshot(preferred.id);
      } else {
        snapshotLoading = false;
      }
    } catch {
      customers = [];
      snapshotError = "We couldn't load your accounts.";
      snapshotLoading = false;
    } finally {
      customersLoading = false;
    }
  }

  function retrySnapshot(): void {
    if (activeCustomerId) void loadSnapshot(activeCustomerId);
    else void loadCustomers();
  }

  async function loadSnapshot(customerId: string): Promise<void> {
    if (!customerId) return;
    const seq = ++snapshotSeq;
    snapshotLoading = true;
    snapshotError = '';
    try {
      const sessionResponse = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerId })
      });
      if (!sessionResponse.ok) throw new Error('Could not start a session.');

      const [accountsResponse, overviewResponse] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/overview')
      ]);
      if (seq !== snapshotSeq) return;
      if (!accountsResponse.ok) throw new Error('Could not load accounts.');

      const snapshot = (await accountsResponse.json()) as AccountsSnapshot;
      const overview = overviewResponse.ok
        ? ((await overviewResponse.json()) as OverviewSnapshot)
        : null;
      if (seq !== snapshotSeq) return;

      liveCustomer = snapshot.customer ?? null;
      liveAccounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
      liveBills = Array.isArray(snapshot.bills) ? snapshot.bills : [];
      loans = Array.isArray(snapshot.loans) ? snapshot.loans : [];
      recentActivity = Array.isArray(snapshot.recentActivity) ? snapshot.recentActivity : [];
      snapshotOverview = overview;
      snapshotVersion++;
      if (seq === snapshotSeq) openDeepLinkedAccount();
    } catch {
      if (seq !== snapshotSeq) return;
      snapshotError = "We couldn't load your accounts.";
    } finally {
      if (seq === snapshotSeq) snapshotLoading = false;
    }
  }

  function openAccountView(accountId: string, tab: WalletTab): void {
    if (!accountId) return;
    accountNotice = '';
    accountOpen = false;
    focusTransactionId = '';
    walletView = { accountId, tab };
  }

  function confirmProfileClosure(): void {
    if (!activeCustomerId) return;
    closingCustomer = { id: activeCustomerId, name: activeName };
    closeProfileError = '';
    closeProfileDialog.showModal();
    cancelCloseProfile.focus();
  }

  async function closeProfile(): Promise<void> {
    if (closingProfile || !closingCustomer) return;
    closingProfile = true;
    closeProfileError = '';
    try {
      const response = await fetch('/api/profile', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerId: closingCustomer.id })
      });
      if (response.status === 204) {
        window.location.replace('/');
        return;
      }
      const payload = await response.json() as { error?: string };
      if (payload.error) {
        closeProfileError = payload.error;
        return;
      }
      throw new Error('Closure was not confirmed');
    } catch {
      closeProfileError = "We couldn't confirm closure. Refresh to check whether this profile is still available.";
    } finally {
      closingProfile = false;
    }
  }

  function openDeepLinkedAccount(): void {
    if (deepLinkHandled) return;
    const accountId = page.url.searchParams.get('account') ?? '';
    const txn = page.url.searchParams.get('txn') ?? '';
    if (!accountId) return;
    if (!liveAccounts.some((account) => account.id === accountId)) return;
    deepLinkHandled = true;
    focusTransactionId = txn;
    walletView = { accountId, tab: 'activity' };
  }

  function closeAccountView(): void {
    walletView = null;
    focusTransactionId = '';
    if (page.url.searchParams.has('account') || page.url.searchParams.has('txn')) {
      void goto('/dashboard', { replaceState: true, noScroll: true });
    }
  }

  async function handleAccountDeleted(accountId: string): Promise<void> {
    if (walletView?.accountId !== accountId) return;
    if (primaryCheckingId === accountId) recentActivity = [];
    liveAccounts = liveAccounts.filter((account) => account.id !== accountId);
    liveBills = liveBills.filter((bill) => bill.accountId !== accountId);
    loans = loans.filter((loan) => loan.accountId !== accountId);
    snapshotOverview = null;
    closeAccountView();
    accountNotice = 'Account deleted.';
    void loadSnapshot(activeCustomerId);
    await tick();
    accountButton?.focus();
  }
  let inChat = $derived(page.params.view === 'chat');
  let guestChat = $derived(inChat && page.url.searchParams.get('topic') === 'open-account');
  let query = $state('');
  let chatPrompt = $state<{ text: string; id: number } | null>(null);
  let promptSeq = 0;
  let canSend = $state(false);
  let chatPanel = $state<ChatPanelApi>();
  const slideTiming = { duration: 480, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' };
  let composer: HTMLFormElement;
  let composerHeight = $state(58);
  let gradient: HTMLDivElement;
  let dashboardHeaderHeight = $state(0);
  let coveringDashboard = $state(false);
  let previousGradientHeight = 0;
  let previousGlowOffset = 0;
  let gradientAnimation: Animation | undefined;
  let previousComposerBounds: DOMRect | undefined;
  let composerAnimation: Animation | undefined;
  let chatResults: HTMLElement;
  let chatRevealAnimation: Animation | undefined;

  beforeNavigate(({ from, to }) => {
    previousComposerBounds = undefined;
    if (
      composer && from?.route.id === to?.route.id &&
      from?.params?.view !== to?.params?.view &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      previousComposerBounds = composer.getBoundingClientRect();
      const gradientBounds = gradient.getBoundingClientRect();
      previousGradientHeight = gradientBounds.height;
      previousGlowOffset = gradientBounds.bottom - previousComposerBounds.top - previousComposerBounds.height / 2;
      if (to?.params?.view === 'chat' && !coveringDashboard) {
        dashboardHeaderHeight = gradient.parentElement!.offsetHeight;
      }
      coveringDashboard = to?.params?.view === 'chat';
      composerAnimation?.cancel();
      gradientAnimation?.cancel();
      chatRevealAnimation?.cancel();
    }
  });

  afterNavigate(({ from }) => {
    if (guestChat && from?.url.searchParams.get('topic') !== 'open-account') {
      chatPrompt = { text: OPEN_ACCOUNT_MESSAGE, id: ++promptSeq };
    }
    if (!previousComposerBounds) return;

    const { left, top, height } = composer.getBoundingClientRect();
    const x = previousComposerBounds.left - left;
    const y = previousComposerBounds.top - top;
    previousComposerBounds = undefined;

    composerAnimation = composer.animate(
      [{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }],
      slideTiming
    );
    if (inChat) {
      // Keep the history's reveal edge just above the moving composer.
      chatRevealAnimation = chatResults.animate(
        [{ clipPath: `inset(0 0 ${Math.max(0, -y)}px 0)` }, { clipPath: 'inset(0)' }],
        slideTiming
      );
    }
    const gradientBounds = gradient.getBoundingClientRect();
    const glowOffset = gradientBounds.bottom - top - height / 2;
    gradientAnimation = gradient.animate(
      [
        { height: `${previousGradientHeight}px`, backgroundPosition: `0 ${glowOffset - previousGlowOffset}px, 0 0` },
        { height: `${gradientBounds.height}px`, backgroundPosition: '0 0, 0 0' }
      ],
      slideTiming
    );
    gradientAnimation.onfinish = () => {
      coveringDashboard = false;
    };
  });


  function openChat() {
    if (!inChat) void goto('/chat', { keepFocus: true });
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (inChat && !canSend) {
      // The panel is still booting or a turn is in flight. Queue through the
      // ChatPanel's initialPrompt flush instead of dropping the text; it sends
      // as soon as the session is ready and no turn is streaming.
      query = '';
      chatPrompt = { text: trimmed, id: ++promptSeq };
      return;
    }
    query = '';
    if (inChat) {
      void chatPanel?.ask(trimmed);
      return;
    }
    chatPrompt = { text: trimmed, id: ++promptSeq };
    openChat();
  }

  function search(event: SubmitEvent) {
    event.preventDefault();
    send(query);
  }

  function handleComposerKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send(query);
    }
  }
  let customersRequested = false;
  $effect(() => {
    if (!guestChat && !customersRequested) {
      customersRequested = true;
      void loadCustomers();
    }
  });

  onMount(() => {
    removedCustomer = lastRemovedCustomer();
    // ClimateWise "Make a plan with Eno" links arrive as /dashboard?ask=<prompt>.
    const ask = page.url.searchParams.get('ask')?.trim();
    if (ask) {
      // Replace the ?ask= history entry so Back doesn't re-send the prompt.
      chatPrompt = { text: ask, id: ++promptSeq };
      void goto('/chat', { replaceState: true, keepFocus: true });
    }

    try {
      const saved = localStorage.getItem('dashboard-theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') theme = saved;
    } catch {
      // The system preference still works when browser storage is unavailable.
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    systemPrefersDark = media.matches;
    const onMediaChange = (event: MediaQueryListEvent) => {
      systemPrefersDark = event.matches;
    };
    media.addEventListener('change', onMediaChange);

    return () => media.removeEventListener('change', onMediaChange);
  });

  function toggleTheme(): void {
    theme = isDark ? 'light' : 'dark';
    try {
      localStorage.setItem('dashboard-theme', theme);
    } catch {
      // Keep the selected theme for the current visit.
    }
  }

</script>

<svelte:head>
  <title>{inChat ? 'Wallet chat' : 'Account overview'} | Capital One</title>
  <meta name="description" content="Your Capital One accounts, rewards, and credit tools." />
</svelte:head>

{#snippet cardIcon()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18m-14 5h4"/></svg>
{/snippet}

{#snippet arrowIcon()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 18 18 6M8 6h10v10"/></svg>
{/snippet}

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div class="dashboard" class:chat={inChat} class:view-open={walletView !== null} data-theme={theme}>
  <div class="dashboard-body" inert={walletView !== null}>
    <div class="wallet-band" style:--composer-half-height={`${composerHeight / 2}px`}>
      <div class="wallet-gradient" bind:this={gradient} aria-hidden="true"></div>
      <div class="container header-inner">
        <a class="brand" href="/"><CapitalOneLogo label="Capital One home" /></a>
        <div class="header-actions">
          {#if guestChat}
            <div class="profile">
              <span class="avatar" aria-hidden="true">G</span>
              <span class="profile-name">Guest</span>
            </div>
          {:else}
          <div class="account-menu" role="presentation" bind:this={accountMenuEl} onkeydown={handleMenuKeydown}>
            <button
              class="profile"
              bind:this={accountButton}
              aria-label={`Switch account${activeName ? `: ${activeName}` : ''}`}
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              aria-controls="account-dropdown"
              onclick={toggleAccountMenu}
            >
              <span class="avatar" aria-hidden="true">{activeInitial}</span>
              <span class="profile-name">{activeFirstName}</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            {#if accountOpen}
              <div class="account-dropdown" id="account-dropdown" role="menu" aria-label="Switch account">
                <p class="account-dropdown-title">Switch account</p>
                <CustomerRemovalNotice removed={removedCustomer} error={removalError} busy={!!deletingId} onundo={undoRemoval} />
                {#each customers as customer (customer.id)}
                  <div class="customer-row" role="none">
                  <button
                    class="account-option"
                    role="menuitemradio"
                    aria-checked={customer.id === activeCustomerId}
                    onclick={() => selectCustomer(customer.id)}
                  >
                    <span class="avatar" aria-hidden="true">{customer.firstName[0] ?? '?'}</span>
                    <span class="account-meta">
                      <strong>{customer.firstName} {customer.lastName}</strong>
                      {#if customer.city}<small>{customer.city}, {customer.state}</small>{/if}
                    </span>
                    {#if customer.id === activeCustomerId}
                      <svg class="account-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 5 5 9-10" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    {/if}
                  </button>
                  <DeleteCustomerButton {customer} menuItem disabled={!!deletingId} ondelete={() => deleteCustomer(customer)} />
                  </div>
                {/each}
                {#if customers.length === 0}
                  <p class="muted">{customersLoading ? 'Loading accounts…' : 'No accounts available.'}</p>
                {/if}
              </div>
            {/if}
          </div>
          {/if}
          <button
            class="theme-toggle"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={isDark}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            onclick={toggleTheme}
          >
            {#if isDark}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"/></svg>
            {/if}
          </button>
        </div>
        {#if inChat}
          <a class="return-dashboard" href="/dashboard">
            <span class="avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m6-6-6 6 6 6"/></svg>
            </span>
            Return to dashboard
          </a>

        {/if}
        <main class="chat-results" aria-label="Wallet chat" hidden={!inChat} bind:this={chatResults}>
          <ChatPanel
            bind:this={chatPanel}
            open={inChat}
            customerId={guestChat ? GUEST_CUSTOMER_ID : activeCustomerId}
            initialPrompt={chatPrompt}
            bind:canSend
            variant={isDark ? 'dark' : 'light'}
            onClose={() => void goto('/dashboard')}
          />
        </main>
        <div class="composer-area">
          <form class="composer" bind:this={composer} bind:offsetHeight={composerHeight} onsubmit={search}>
            <div class="composer-field" data-value={query}>
              <textarea bind:value={query} onfocus={openChat} onkeydown={handleComposerKeydown} rows="1" aria-label="Ask Capital One" placeholder="Ask about your money, spending, or bills…"></textarea>
            </div>
            <button class="primary send" aria-label="Ask" disabled={!query.trim() || (inChat && !canSend)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>
            </button>
          </form>
        </div>
      </div>
    </div>

    {#if !inChat || coveringDashboard}
      <main class="account-overview" aria-label="Account overview" inert={inChat}
        style:--dashboard-header-height={`${dashboardHeaderHeight}px`}>
        <div class="container content">
          <section class="stack" aria-labelledby="accounts-title">
            <h2 id="accounts-title" class="section-title">Your accounts <span class="count">{displayAccounts.length}</span></h2>
            <div role="status" class="account-notice">{accountNotice}</div>

            {#if snapshotError}
              <article class="panel retry-card" aria-live="polite">
                <p>{snapshotError}</p>
                <button class="primary" onclick={retrySnapshot}>Retry</button>
              </article>
            {/if}

            {#if snapshotLoading && displayAccounts.length === 0}
              {#each [0, 1, 2] as skeleton (skeleton)}
                <div class="skeleton-card" aria-hidden="true"></div>
              {/each}
            {:else if displayAccounts.length === 0 && !snapshotError}
              <article class="panel welcome-empty">
                <div class="empty-eno"><img src="/images/eno-character.png" alt="Eno" width="1254" height="1254" /></div>
                <p class="empty-greeting">A LITTLE ROOM FOR YOUR NEXT CHAPTER</p>
                <h2>Welcome to your fresh start, {activeFirstName}.</h2>
                <p class="muted">No accounts or cards yet. When you add them, they’ll feel right at home here.</p>
                <button class="primary" onclick={openChat}>Say hello to Eno {@render arrowIcon()}</button>
              </article>
            {:else}
              {#each displayAccounts as account (account.id)}
                {@const [dollars, cents] = account.balance.split('.')}
                <article class="account {account.tint}" id={'account-' + account.id}>
                  <div class="account-top">
                    <h2>{account.name} <span>•• {account.ending}</span></h2>
                    {#if account.scheduled}
                      <p class="account-note">{account.scheduled}</p>
                    {/if}
                  </div>
                  <div class="account-balance">
                    <div class="balance-label">{account.kind}</div>
                    <div class="balance" aria-live="polite">
                      ${dollars}<span class="cents">.{cents}</span>
                    </div>
                  </div>
                  <div class="card-actions">
                    <button class="pill" onclick={() => openAccountView(account.id, 'activity')}>{@render arrowIcon()} View activity</button>
                    <button class="pill" onclick={() => openAccountView(account.id, 'details')}>{@render cardIcon()} Account settings</button>
                  </div>
                </article>
              {/each}
            {/if}

            {#if recentActivity.length}
              <article class="panel activity-panel">
                <div class="panel-heading">
                  <h2>Recent activity</h2>
                  <button class="link" onclick={() => openAccountView(primaryCheckingId, 'activity')}>View all {@render arrowIcon()}</button>
                </div>
                <div class="activity-rows">
                  {#each recentActivity as transaction (transaction.id)}
                    <button class="activity-row" onclick={() => openAccountView(primaryCheckingId, 'activity')}>
                      <span class="activity-main">
                        <strong>{transaction.description || 'Transaction'}</strong>
                        <small>{dateLabel(transaction.date)} · {transaction.kind === 'deposit' ? 'Deposit' : 'Withdrawal'}{#if transaction.status.toLowerCase() === 'pending'} · Pending{/if}</small>
                      </span>
                      <span class="activity-amount" class:deposit={transaction.kind === 'deposit'}>
                        {transaction.kind === 'deposit' ? '+' : '−'}{money(transaction.amount, { decimals: 2 })}
                      </span>
                    </button>
                  {/each}
                </div>
              </article>
            {/if}
          </section>

          <section class="stack tools" aria-labelledby="tools-title">
            <h2 id="tools-title" class="section-title">Your tools</h2>

            {#if liveAccounts.length > 0}

            {#if upcoming.length}
              <article class="panel bills-panel">
                <div class="panel-heading">
                  <h2>Upcoming bills</h2>
                  <button class="link" onclick={() => openAccountView(primaryCheckingId, 'bills')}>View all {@render arrowIcon()}</button>
                </div>
                <div class="bill-rows">
                  {#each upcoming.slice(0, 3) as bill (bill.id)}
                    <button class="bill-row" onclick={() => openAccountView(bill.accountId || primaryCheckingId, 'bills')}>
                      <span class="bill-main">
                        <strong>{bill.payee || bill.nickname || 'Bill'}</strong>
                        <small>{dateLabel(bill.upcomingDate)}</small>
                      </span>
                      <span class="bill-amount">{money(bill.amount, { decimals: 2 })}</span>
                    </button>
                  {/each}
                </div>
              </article>
            {/if}

            <article class="panel feature reward">
              <div class="feature-main">
                <div><h2>Explore rewards and benefits</h2><p class="reward-amount">{rewardPoints.toLocaleString('en-US')} pts</p><p class="muted">Rewards points</p></div>
                <button class="primary" disabled={!firstCredit} onclick={() => firstCredit && openAccountView(firstCredit.id, 'details')}>View rewards</button>
              </div>
              <div class="panel-footer">
                <a class="link" href="https://travel.capitalone.com/">Travel {@render arrowIcon()}</a>
                <a class="link" href="https://capitalone.com/entertainment/">Entertainment {@render arrowIcon()}</a>
              </div>
            </article>
            <article class="panel feature products">
              <div class="feature-main">
                <div><h2>Explore other products</h2><p class="muted">Find an account that’s right for you.</p></div>
                <a class="primary" href="https://www.capitalone.com/">Open a new account</a>
              </div>
            </article>
            <article class="panel utility">
              <h2>CreditWise</h2>
              <div class="credit">
                <div class="gauge" role="img" aria-label={`Demo credit score: ${creditScore} out of 850, ${creditRating.label}`} style={`--score-color: ${creditRating.color}; --score-progress: ${creditGaugeProgress}%`}><div><strong>{creditScore}</strong><small>{creditRating.label}</small></div></div>
                <div><p>Review your credit report for signs of error, theft or fraud.</p><small class="muted">Demo score</small></div>
              </div>
              <a class="link" href="https://www.capitalone.com/creditwise/">Check your FICO® Score {@render arrowIcon()}</a>
            </article>
            <ClimateWiseWidget refresh={snapshotVersion} />
            {:else if !snapshotLoading && !snapshotError}
              <article class="panel utility getting-started">
                <h2>Make yourself at home.</h2>
                <p class="muted">Questions about banking? Wondering where to start? You don’t need an account to say hello.</p>
                <button class="link" onclick={() => send('I’m new here. What can I do with Eno?')}>Let’s get acquainted {@render arrowIcon()}</button>
              </article>
            {/if}
            {#if activeCustomerId && activeCustomerId !== GUEST_CUSTOMER_ID && !snapshotLoading && !snapshotError}
              <article class="panel feature">
                <div class="feature-main">
                  <div><h2>Close profile</h2><p class="muted">Close this demo profile and all its accounts.</p></div>
                  <button class="close-profile-button" onclick={confirmProfileClosure}>Close profile</button>
                </div>
              </article>
            {/if}
          </section>

          <footer>
            <nav aria-label="Footer">
              <a href="https://www.capitalone.com/">Products</a>
              <a href="https://www.capitalone.com/about/">About us</a>
              <a href={helpCenter}>Help</a>
              <a href="https://www.capitalone.com/privacy/">Privacy</a>
              <a href="https://www.capitalone.com/digital/security/">Security</a>
              <a href="https://www.capitalone.com/accessibility/">Accessibility</a>
            </nav>
            <p>Products and services are offered by Capital One, N.A., Member FDIC.</p>
          </footer>
        </div>
      </main>
    {/if}
  </div>

  <dialog
    class="close-profile-dialog"
    bind:this={closeProfileDialog}
    aria-labelledby="close-profile-title"
    aria-describedby="close-profile-description"
    oncancel={(event) => { if (closingProfile) event.preventDefault(); }}
  >
    <h2 id="close-profile-title">Close profile?</h2>
    <p id="close-profile-description">
      Closing <strong>{closingCustomer?.name}</strong> permanently deletes all its demo accounts
      and removes the profile from sign-in. You can’t undo this.
    </p>
    {#if closeProfileError}<p role="alert">{closeProfileError}</p>{/if}
    <div class="close-profile-actions">
      <form method="dialog">
        <button class="primary" bind:this={cancelCloseProfile} disabled={closingProfile}>Cancel</button>
      </form>
      <button class="close-profile-button" disabled={closingProfile} onclick={closeProfile}>
        {closingProfile ? 'Closing profile…' : 'Close profile'}
      </button>
    </div>
  </dialog>

  {#if walletView}
    {@const cardActivity = walletView.tab === 'activity' && displayAccounts.some(
      (account) => account.id === walletView?.accountId && account.credit
    )}
    <ViewShell title={walletView.tab === 'details' ? 'Account settings' : 'Account details'} subtitle={activeName} onBack={closeAccountView}
      {cardActivity} profileName={activeFirstName}>
      <AccountDetailView
        accountId={walletView.accountId}
        initialTab={walletView.tab}
        {cardActivity}
        {focusTransactionId}
        onAccountDeleted={handleAccountDeleted}
      />
    </ViewShell>
  {/if}
</div>

<style>
  :global(body:has(.dashboard)) { margin: 0; }
  :global(html:has(.dashboard)) { scrollbar-gutter: stable; }
  :global(html:has(.dashboard.chat)) { overflow: hidden; }
  :global(html:has(.dashboard.view-open)) { overflow: hidden; }
  .dashboard {
    --dark: ;
    --light: initial;
    --shadow: 0 2px 4px #12273408;
    --surface: var(--dark, #18252d) var(--light, #fff);
    --ink: var(--dark, #ecf3f6) var(--light, #142632);
    --muted: var(--dark, #b1c3cc) var(--light, #50636e);
    --border: var(--dark, #31444f) var(--light, #dae3e8);
    --link: var(--dark, #9fdbf0) var(--light, #075e80);
    --button: var(--dark, #bde7f5) var(--light, #123f56);
    --button-text: var(--dark, #142632) var(--light, #fff);
    --page: var(--dark, #10191f) var(--light, #f4f6f8);
    --glow: var(--dark, #21475f) var(--light, #c6e5fc);
    --banner: var(--dark, #1b313b) var(--light, #ecf4f7);
    min-height: 100vh;
    background: var(--page);
    color: var(--ink);
    color-scheme: var(--dark, dark) var(--light, light);
    font: 15px/1.45 Inter, system-ui, sans-serif;
  }
  .dashboard[data-theme='dark'] { --dark: initial; --light: ; }
  @media (prefers-color-scheme: dark) {
    .dashboard[data-theme='system'] { --dark: initial; --light: ; }
  }
  .dashboard-body { position: relative; container-type: inline-size; }
  .dashboard * { box-sizing: border-box; }
  h2, p { margin: 0; }
  h2 { font-size: 17px; line-height: 1.35; letter-spacing: -.025em; }
  button { font: inherit; color: inherit; }
  button, a { -webkit-tap-highlight-color: transparent; }
  button { cursor: pointer; }
  a { color: inherit; text-decoration: none; }
  :is(a, button):focus-visible { outline: 2px solid var(--link); outline-offset: 3px; }
  svg { width: 17px; height: 17px; flex: none; vertical-align: middle; }
  .container { width: min(1136px, calc(100% - 64px)); margin-inline: auto; }
  .header-inner {
    position: relative;
    display: grid;
    grid-template-columns: 130px minmax(0, 720px) auto;
    justify-content: space-between;
    align-items: start;
    gap: 16px;
    padding-block: 28px;
  }
  .header-inner .brand { grid-column: 1; grid-row: 1; justify-self: start; margin-top: 4px; }
  .composer-area, .return-dashboard { grid-column: 2; grid-row: 1; }
  .chat .account-overview {
    position: absolute;
    inset: var(--dashboard-header-height) 0 auto;
  }
  .chat .dashboard-body { overflow: clip; }
  .chat .header-inner {
    height: 100dvh;
    grid-template-rows: auto minmax(0, 1fr) auto;
    padding-bottom: var(--composer-bottom-padding);
  }
  .chat .composer-area { grid-row: 3; width: 100%; }
  .chat-results {
    grid-column: 2;
    grid-row: 2;
    align-self: stretch;
    min-height: 0;
  }
  .brand { display: inline-flex; flex: none; padding: 3px 8px; margin-left: -8px; border-radius: 8px; color: var(--dark, #fff) var(--light, #013d5b); }
  .brand :global(svg) { display: block; width: 122px; height: 44px; }
  .link { background: transparent; border: 0; padding: 0; }
  a.link:hover, footer a:hover { text-decoration: underline; }
  button.link:hover { color: var(--ink); }
  .profile, .return-dashboard {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 42px;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0 12px 0 5px;
    margin-top: 8px;
    background: var(--page);
    font-size: 13px;
    font-weight: 650;
    white-space: nowrap;
  }
  .header-actions {
    grid-column: 3;
    grid-row: 1;
    justify-self: end;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }
  .header-actions .profile { margin-top: 0; }
  .return-dashboard { justify-self: center; }
  :is(.profile, .return-dashboard):hover { background: var(--surface); }
  .avatar { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--banner); color: var(--link); }
  .profile .chevron { width: 13px; height: 13px; color: var(--muted); }
  .account-menu { position: relative; }
  .account-dropdown {
    max-height: min(500px, calc(100dvh - 110px));
    overflow-y: auto;
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 30;
    width: min(17rem, calc(100vw - 32px));
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    box-shadow: 0 18px 40px #0b182326;
  }
  .account-dropdown-title {
    padding: 6px 10px 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .customer-row { display: flex; align-items: center; border-radius: 12px; }.customer-row:hover { background: var(--page); }
  .account-option {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    border: 0;
    border-radius: 10px;
    padding: 8px 10px;
    background: transparent;
    color: var(--ink);
  }
  .account-option:hover, .account-option:focus-visible { background: var(--page); }
  .account-option[aria-checked='true'] { background: var(--banner); }
  .account-meta { display: grid; gap: 1px; min-width: 0; }
  .account-meta strong { font-size: 13px; font-weight: 650; overflow-wrap: anywhere; }
  .account-meta small { font-size: 11px; color: var(--muted); }
  .account-option .avatar { width: 28px; height: 28px; font-size: 12px; }
  .account-check { width: 16px; height: 16px; margin-left: auto; color: var(--link); flex: none; }
  .theme-toggle {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--page);
    color: var(--ink);
  }
  .theme-toggle:hover { background: var(--surface); }
  .theme-toggle svg { width: 18px; height: 18px; }
  .wallet-band { position: relative; z-index: 1; }
  .wallet-band { --composer-bottom-padding: 28px; }
  .chat .wallet-band { --composer-bottom-padding: max(24px, env(safe-area-inset-bottom)); }
  .wallet-gradient {
    position: absolute;
    inset: 0 0 auto;
    height: 100%;
    box-sizing: border-box;
    pointer-events: none;
    background:
      radial-gradient(
        ellipse min(52vw, 42rem) clamp(12rem, 42dvh, 24rem) at 50% calc(100% - var(--composer-bottom-padding) - var(--composer-half-height) + 1px),
        color-mix(in srgb, var(--glow) 74%, transparent),
        color-mix(in srgb, var(--glow) 25%, transparent) 48%,
        transparent 100%
      ),
      var(--page);
    border-bottom: 1px solid var(--border);
  }
  .composer { position: relative; z-index: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 28px; box-shadow: 0 8px 24px #102b421c; }
  .composer-field {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    margin-right: 52px;
  }
  .composer-field::after, .composer textarea {
    grid-area: 1 / 1;
    min-width: 0;
    max-height: 152px;
    padding: 16px 8px 16px 20px;
    font: inherit;
    line-height: 24px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .composer-field::after {
    content: attr(data-value) " " / "";
    visibility: hidden;
  }
  .composer textarea {
    width: 100%;
    resize: none;
    overflow-y: auto;
    border: 0;
    outline: 0;
    background: transparent;
    color: inherit;
  }
  .composer textarea::placeholder { color: var(--muted); }
  .composer .send { position: absolute; right: 8px; top: 8px; width: 40px; height: 40px; min-height: 40px; border-radius: 50%; padding: 0; }
  .send:disabled { opacity: .55; cursor: default; }
  .link { display: inline-flex; align-items: center; gap: 5px; color: var(--link); font-weight: 650; text-align: left; }
  .link svg { width: 15px; height: 15px; }

  .content {
    display: grid;
    grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr);
    align-items: start;
    gap: 20px;
    padding-block: 24px 40px;
  }
  .content > footer { grid-column: 1 / -1; }
  .tools .feature-main { flex-wrap: wrap; }
  .stack { display: grid; gap: 14px; }
  .section-title { font-size: 23px; }
  .section-title .count { color: var(--muted); font-size: 15px; font-weight: 500; }
  .skeleton-card {
    height: 108px;
    border: 1px solid var(--border);
    border-radius: 15px;
    background: linear-gradient(100deg, var(--surface) 30%, var(--page) 50%, var(--surface) 70%);
    background-size: 220% 100%;
    animation: skeleton-pulse 1.4s ease-in-out infinite;
  }
  @keyframes skeleton-pulse {
    from { background-position: 100% 0; }
    to { background-position: -100% 0; }
  }
  .retry-card { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 16px 18px; }
  .empty-note { padding: 16px 0; }
  .welcome-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 18px; padding: 36px; }
  .welcome-empty h2 { max-width: 400px; font-size: clamp(24px, 3vw, 34px); line-height: 1.2; letter-spacing: -.04em; }
  .welcome-empty > .muted { max-width: 390px; }
  .empty-greeting { color: var(--link); font-size: 10px; font-weight: 600; letter-spacing: .12em; }
  .empty-eno { position: relative; width: 68px; height: 76px; }
  .empty-eno img { position: absolute; top: 45%; left: 52%; width: 118px; height: 118px; transform: translate(-50%, -50%); }
  .getting-started { gap: 16px; padding: 24px; }
  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 18px;
    border-bottom: 1px solid var(--border);
  }
  .panel-heading h2 { font-size: 15px; }
  .activity-rows, .bill-rows { display: grid; }
  .activity-row, .bill-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    width: 100%;
    padding: 11px 18px;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: var(--ink);
    text-align: left;
  }
  .activity-row:last-child, .bill-row:last-child { border-bottom: 0; }
  .activity-row:hover, .bill-row:hover { background: var(--page); }
  .activity-main, .bill-main { display: grid; gap: 2px; min-width: 0; }
  .activity-main strong, .bill-main strong { font-size: 14px; font-weight: 600; }
  .activity-main small, .bill-main small { color: var(--muted); font-size: 11px; }
  .activity-amount, .bill-amount { flex: none; font-size: 14px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .activity-amount.deposit { color: #568825; }
  .account, .panel { box-shadow: var(--shadow); }
  .account-notice:empty { position: absolute; }
  .panel { border: 1px solid var(--border); }
  .account {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px 20px;
    padding: 14px 20px;
    border-radius: 15px;
    color: #fff;
    background:
      radial-gradient(ellipse at 90% 0%, #ffffff13, transparent 65%),
      linear-gradient(112deg, var(--account-start), var(--account-end));
    scroll-margin-top: 18px;
  }
  .aqua { --account-start: #062f4c; --account-end: #126379; }
  .slate { --account-start: #28354d; --account-end: #505f78; }
  .peach { --account-start: #752d27; --account-end: #a74829; }
  .rose { --account-start: #54253b; --account-end: #924536; }
  .account-top h2 { font-size: 21px; font-weight: 550; }
  .account-top h2 span { font-size: 12px; margin-left: 4px; white-space: nowrap; }
  .balance-label { font-size: 12px; }
  .account :is(a, button):focus-visible { outline-color: #fff; }
  .balance, .reward-amount { font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -.055em; }
  .balance { font-size: clamp(26px, 4vw, 36px); line-height: 1; font-weight: 450; }
  .cents { color: #ffffffe0; font-size: .69em; letter-spacing: -.03em; }
  .card-actions, .panel-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .account-balance { text-align: right; }
  .card-actions { grid-column: 1 / -1; }
  .card-actions .pill { width: 10rem; max-width: 100%; }
  .pill, .primary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 13px; min-height: 38px; font-size: 13px; font-weight: 650; }
  .pill { background: transparent; border: 1px solid #ffffffcb; border-radius: 5px; }
  .pill:hover { background: #ffffff25; }
  .primary { background: var(--button); border: 1px solid transparent; color: var(--button-text); border-radius: 10px; text-align: center; }
  .primary:hover { opacity: .88; }
  .primary:disabled { opacity: .55; cursor: default; }
  .account-note { margin-top: 4px; font-size: 12px; }

  .panel { background: var(--surface); border-radius: 16px; overflow: hidden; }
  .feature { display: flex; flex-direction: column; }
  .feature-main { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 20px 22px; flex: 1; }
  .close-profile-button {
    padding: 9px 14px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: #a22731;
    color: white;
    font-weight: 650;
  }
  .close-profile-dialog {
    width: min(440px, calc(100% - 32px));
    margin: auto;
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
    color: var(--ink);
  }
  .close-profile-dialog::backdrop { background: #0b182399; }
  .close-profile-dialog p { margin-top: 12px; }
  .close-profile-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 20px; }
  .close-profile-actions button:disabled { opacity: 0.65; cursor: default; }
  .products .feature-main { align-items: flex-start; }
  .products p { margin-top: 5px; }
  .reward { background: var(--banner); }
  .reward-amount { font-size: 33px; line-height: 1.15; margin-top: 7px; }
  .muted, footer { color: var(--muted); }
  .panel-footer { gap: 20px; padding: 10px 22px; border-top: 1px solid var(--border); font-size: 13px; }
  .utility { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 17px; min-height: 172px; }
  .credit p { font-size: 14px; color: var(--muted); }
  .utility > .link { margin-top: auto; font-size: 13px; }
  .credit { display: flex; align-items: center; gap: 12px; }
  .gauge { flex: none; width: 78px; height: 78px; padding: 4px; border-radius: 50%; background: conic-gradient(from 225deg, var(--score-color) 0 var(--score-progress), var(--border) var(--score-progress) 75%, transparent 75%); }
  .gauge div { display: grid; width: 100%; height: 100%; place-content: center; text-align: center; border-radius: 50%; background: var(--surface); }
  .gauge strong { font-size: 24px; line-height: 1; }
  .gauge small { font-size: 10px; color: var(--muted); }
  footer { margin-top: 8px; padding-top: 17px; border-top: 1px solid var(--border); font-size: 13px; }
  footer nav { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 18px; margin-bottom: 8px; }
  footer a { font-weight: 650; }
  footer p { text-align: center; }

  @container (max-width: 850px) {
    .container { width: calc(100% - 36px); }
    .header-inner {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 18px 12px;
    }
    .header-inner .brand, .header-actions, .return-dashboard { margin-top: 0; }
    .header-actions { grid-column: 2; grid-row: 1; justify-self: end; margin-top: 0; }
    .composer-area, .return-dashboard, .chat-results {
      grid-column: 1 / -1;
      grid-row: 2;
    }
    .dashboard:not(.chat) .header-inner { row-gap: 0; }
    .dashboard:not(.chat) .composer-area { margin-top: 28px; }
    .composer-area, .chat .composer-area, .chat-results { width: min(720px, 100%); justify-self: center; }
    .chat .header-inner { grid-template-rows: auto auto minmax(0, 1fr) auto; }
    .chat-results { grid-row: 3; }
    .chat .composer-area { grid-row: 4; }
    .content { grid-template-columns: minmax(0, 1fr); }
  }
  @container (max-width: 570px) {
    .container { width: calc(100% - 28px); }
    .wallet-band { --composer-bottom-padding: 20px; }
    .header-inner { padding-block: 20px; }
    .dashboard:not(.chat) .composer-area { margin-top: 20px; }
    .brand :global(svg) { width: 94px; height: 36px; }
    .content { padding-top: 18px; gap: 12px; }
    .account { padding-inline: 14px; column-gap: 9px; }
    .account-top h2 { font-size: 18px; }
    .feature-main { padding-inline: 17px; }
  }
</style>
