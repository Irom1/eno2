<script lang="ts">
  import '$lib/assets/message-composer.css';
  import { accountProduct } from '$lib/products';
  import CustomerDropdown from '$lib/components/CustomerDropdown.svelte';
  import { customerHref, orderCustomers, savedCustomerId, rememberCustomerId } from '$lib/customerSelection';
  import { fetchWithSession, recoverSession, signOut } from '$lib/sessionRecovery';
  import { demoCreditScore, creditScoreRating } from '$lib/creditWise';
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount, tick } from 'svelte';
  import { GUEST_CUSTOMER_ID, OPEN_ACCOUNT_MESSAGE } from '$lib/chat/guest';
  import { dateLabel, money } from '$lib/format';
  import {
    accountEnding,
    accountKind,
    formatAmount,
    isCredit,
    scheduledTotal,
    upcomingBills,
    type WalletAccount,
    type WalletBill,
    type WalletCustomer,
    type WalletTransaction
  } from '$lib/wallet';
  import {
    FRESH_MS,
    STALE_MS,
    readWalletCache,
    snapshotCacheKey,
    writeWalletCache
  } from '$lib/walletCache';
  import AccountDetailView from './AccountDetailView.svelte';
  import ScheduledPaymentInfo from './ScheduledPaymentInfo.svelte';
  import ViewShell from './ViewShell.svelte';
  import ChatPanel from './ChatPanel.svelte';
  import CapitalOneLogo from './CapitalOneLogo.svelte';
  import ClimateWiseWidget from '$lib/climate/ClimateWiseWidget.svelte';
  import ScoreCard from '$lib/components/ScoreCard.svelte';
  import creditWiseLogoLight from '$lib/assets/creditwise-card-logo-light.png';
  import creditWiseLogoDark from '$lib/assets/creditwise-card-logo-dark.png';
  import { chatViewportMetrics } from '$lib/mobileViewport';

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
  const FULL_COMPOSER_PLACEHOLDER = 'Ask about your money, spending, or bills…';
  const COMPACT_COMPOSER_PLACEHOLDER = 'Ask about your money…';

  interface AccountsSnapshot {
    customer?: WalletCustomer;
    accounts?: WalletAccount[];
    bills?: WalletBill[];
    recentActivity?: WalletTransaction[];
  }

  type WalletTab = 'activity' | 'details' | 'bills';
  let theme = $state<Theme>('system');
  let systemPrefersDark = $state(false);
  let effectiveTheme = $derived(
    theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme
  );
  let isDark = $derived(effectiveTheme === 'dark');
  let accountOpen = $state(false);
  let signingOut = $state(false);
  let signOutError = $state('');
  let accountButton = $state<HTMLButtonElement>();
  let accountMenuEl = $state<HTMLDivElement>();
  let customers = $state<Customer[]>([]);
  let activeCustomerId = $state('');
  let customersLoading = $state(true);
  let customersError = $state(false);
  let activeCustomer = $derived(
    customers.find((customer) => customer.id === activeCustomerId) ?? null
  );
  let activeName = $derived(
    activeCustomer ? `${activeCustomer.firstName} ${activeCustomer.lastName}`.trim() : ''
  );
  let activeInitial = $derived(activeCustomer?.firstName?.[0]?.toUpperCase() ?? 'A');
  let activeFirstName = $derived(activeCustomer?.firstName || 'Account');
  let creditScore = $derived(demoCreditScore(activeCustomerId, activeCustomer ?? undefined));
  let creditRating = $derived(creditScoreRating(creditScore));
  let creditGaugeProgress = $derived(Math.max(2, (creditScore - 300) / 550 * 75));

  let liveCustomer = $state<WalletCustomer | null>(null);
  let liveAccounts = $state<WalletAccount[]>([]);
  let liveBills = $state<WalletBill[]>([]);
  let recentActivity = $state<WalletTransaction[]>([]);
  let snapshotLoading = $state(true);
  let snapshotError = $state('');
  let accountNotice = $state('');
  let closeProfileDialog: HTMLDialogElement;
  let cancelCloseProfile: HTMLButtonElement;
  let closingCustomer = $state<{ id: string; name: string } | null>(null);
  let closingProfile = $state(false);
  let closeProfileError = $state('');
  let snapshotSeq = 0;
  let snapshotCustomerId = $state('');
  // Bumped whenever a snapshot is applied, so cards can refetch.
  let snapshotVersion = $state(0);
  let walletView = $derived.by(() => {
    if (page.params.view !== 'dashboard' || !activeCustomerId ||
        page.url.searchParams.get('customer') !== activeCustomerId ||
        snapshotCustomerId !== activeCustomerId) return null;
    const accountId = page.url.searchParams.get('account');
    if (!accountId || !liveAccounts.some((account) => account.id === accountId)) return null;
    const requestedTab = page.url.searchParams.get('tab');
    const tab: WalletTab = requestedTab === 'details' || requestedTab === 'bills'
      ? requestedTab
      : 'activity';
    return { accountId, tab };
  });
  let focusTransactionId = $derived(page.url.searchParams.get('txn') ?? '');
  // True when the account view was opened from the mounted chat, so the
  // header's return control goes back to chat instead of the dashboard.
  let openedFromChat = $state(false);

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
        const product = accountProduct(account.type, account.nickname);
        const credit = isCredit(account.type);
        const scheduled = credit ? scheduledTotal(liveBills, account.id) : 0;
        return {
          id: account.id,
          name: product?.name ?? (account.nickname || account.type),
          nickname: account.nickname || account.type,
          type: account.type,
          ending: accountEnding(account),
          balance: formatAmount(account.balance),
          kind: accountKind(account.type),
          product,
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
  function focusActiveOption(): void {
    const active = accountMenuEl?.querySelector<HTMLElement>(
      '.account-option[aria-checked="true"]'
    );
    const first = accountMenuEl?.querySelector<HTMLElement>('.account-option');
    (active ?? first ?? accountMenuEl?.querySelector<HTMLElement>('.sign-out'))?.focus();
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

  function customerUrl(id: string): URL {
    const url = new URL(page.url);
    const previousId = url.searchParams.get('customer');
    url.searchParams.set('customer', id);
    if (previousId && previousId !== id) {
      url.searchParams.delete('account');
      url.searchParams.delete('tab');
      url.searchParams.delete('txn');
    }
    return url;
  }

  function activateCustomer(id: string): void {
    if (id !== activeCustomerId) {
      snapshotCustomerId = '';
      liveCustomer = null;
      liveAccounts = [];
      liveBills = [];
      recentActivity = [];
      accountNotice = '';
      activeCustomerId = id;
    }
    rememberCustomerId(id);
    void loadSnapshot(id);
  }

  async function selectCustomer(id: string): Promise<void> {
    if (signingOut) return;
    accountOpen = false;
    if (id !== activeCustomerId) {
      await goto(customerUrl(id), { replaceState: true, noScroll: true, keepFocus: true });
    }
    accountButton?.focus();
  }

  async function handleSignOut(): Promise<void> {
    if (signingOut) return;
    signingOut = true;
    signOutError = '';
    try {
      await signOut();
    } catch {
      signOutError = "Couldn't sign out. Try again.";
      signingOut = false;
    }
  }

  let customersSeq = 0;
  async function loadCustomers() {
    const seq = ++customersSeq;
    customersLoading = true;
    customersError = false;
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
      if (seq !== customersSeq || guestChat) return;
      const sessionCustomerId = currentSession?.customer?.id;
      const requestedCustomerId = page.url.searchParams.get('customer') ||
        (sessionCustomerId === GUEST_CUSTOMER_ID ? '' : sessionCustomerId) ||
        savedCustomerId();
      if (requestedCustomerId && !list.some((customer) => customer.id === requestedCustomerId)) {
        const selectedResponse = await fetch(`/api/customers?customer=${encodeURIComponent(requestedCustomerId)}`);
        if (!selectedResponse.ok) throw new Error('Could not load selected customer.');
        const selectedPayload = await selectedResponse.json() as { customers?: Customer[] };
        const selected = selectedPayload.customers?.find((customer) => customer.id === requestedCustomerId);
        if (selected) list.push(selected);
      }
      if (seq !== customersSeq || guestChat) return;
      customers = orderCustomers(list);
      const preferred =
        customers.find((customer) => customer.id === requestedCustomerId) ?? customers[0];
      if (preferred) {
        activateCustomer(preferred.id);
        if (page.url.searchParams.get('customer') !== preferred.id) {
          await goto(customerUrl(preferred.id), { replaceState: true, noScroll: true, keepFocus: true });
        }
      } else {
        snapshotLoading = false;
      }
    } catch {
      if (seq !== customersSeq) return;
      customers = [];
      customersError = true;
      snapshotError = "We couldn't load your accounts.";
      snapshotLoading = false;
    } finally {
      if (seq === customersSeq) customersLoading = false;
    }
  }

  function retrySnapshot(): void {
    if (activeCustomerId) void loadSnapshot(activeCustomerId);
    else void loadCustomers();
  }

  /** Apply a validated snapshot to the dashboard state. */
  function applySnapshot(snapshot: AccountsSnapshot, customerId: string): boolean {
    if (snapshot.customer?.id && snapshot.customer.id !== customerId) return false;
    liveCustomer = snapshot.customer ?? null;
    liveAccounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
    liveBills = Array.isArray(snapshot.bills) ? snapshot.bills : [];
    recentActivity = Array.isArray(snapshot.recentActivity) ? snapshot.recentActivity : [];
    snapshotCustomerId = customerId;
    snapshotVersion++;
    return true;
  }

  async function loadSnapshot(customerId: string): Promise<void> {
    if (!customerId) return;
    const seq = ++snapshotSeq;
    snapshotError = '';
    const key = snapshotCacheKey(customerId);

    // A fresh cache renders without any network call. This is the fast path for
    // a transaction card opened in a new tab moments after the insight arrived.
    const fresh = readWalletCache<AccountsSnapshot>(key, FRESH_MS);
    if (fresh && applySnapshot(fresh, customerId)) {
      snapshotLoading = false;
      return;
    }

    // A stale cache paints immediately, then revalidates in the background.
    const stale = readWalletCache<AccountsSnapshot>(key, STALE_MS);
    const showingCache = Boolean(stale && applySnapshot(stale, customerId));
    snapshotLoading = !showingCache;

    try {
      const sessionReady = await recoverSession(customerId);
      if (seq !== snapshotSeq) return;
      if (!sessionReady) throw new Error('Could not start a session.');

      const accountsResponse = await fetchWithSession('/api/accounts', {}, customerId);
      if (seq !== snapshotSeq) return;
      if (!accountsResponse.ok) throw new Error('Could not load accounts.');

      const snapshot = (await accountsResponse.json()) as AccountsSnapshot;
      if (seq !== snapshotSeq) return;
      if (snapshot.customer?.id && snapshot.customer.id !== customerId) {
        throw new Error('Account data belongs to a different customer.');
      }

      applySnapshot(snapshot, customerId);
      writeWalletCache(key, snapshot);
    } catch {
      if (seq !== snapshotSeq) return;
      // Keep a cached view rather than replacing it with an error state.
      if (!showingCache) snapshotError = "We couldn't load your accounts.";
    } finally {
      if (seq === snapshotSeq) snapshotLoading = false;
    }
  }

  function openAccountView(accountId: string, tab: WalletTab, transactionId?: string): void {
    if (!accountId || !activeCustomerId || routeCustomerId !== activeCustomerId) return;
    accountNotice = '';
    accountOpen = false;
    const url = new URL(dashboardHref, page.url);
    url.searchParams.set('account', accountId);
    url.searchParams.set('tab', tab);
    if (transactionId) url.searchParams.set('txn', transactionId);
    if (url.href === page.url.href) return;
    void goto(url, { replaceState: walletView !== null, noScroll: true, keepFocus: true });
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
      const response = await fetchWithSession('/api/profile', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerId: closingCustomer.id })
      }, closingCustomer.id);
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

  function closeAccountView(): Promise<void> {
    const destination = openedFromChat ? customerHref('/chat', routeCustomerId) : dashboardHref;
    openedFromChat = false;
    return goto(destination, { replaceState: true, noScroll: true });
  }

  async function handleAccountDeleted(accountId: string): Promise<void> {
    if (walletView?.accountId !== accountId) return;
    if (primaryCheckingId === accountId) recentActivity = [];
    liveAccounts = liveAccounts.filter((account) => account.id !== accountId);
    liveBills = liveBills.filter((bill) => bill.accountId !== accountId);
    await closeAccountView();
    accountNotice = 'Account deleted.';
    void loadSnapshot(activeCustomerId);
    await tick();
    accountButton?.focus();
  }
  let inChat = $derived(page.params.view === 'chat');
  let guestChat = $derived(inChat && page.url.searchParams.get('topic') === 'open-account');
  let routeCustomerId = $derived(guestChat ? '' : page.url.searchParams.get('customer') || activeCustomerId);
  let dashboardHref = $derived(customerHref('/dashboard', routeCustomerId));
  let openAccountsHref = $derived(`${customerHref('/setup', routeCustomerId)}${routeCustomerId ? '&' : '?'}mode=accounts`);
  let query = $state('');
  let compactComposer = $state(false);
  const composerPlaceholder = $derived(
    inChat ? 'Message Eno…' : compactComposer ? COMPACT_COMPOSER_PLACEHOLDER : FULL_COMPOSER_PLACEHOLDER
  );
  let keyboardOpen = $state(false);
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
    const fromAccount = from?.params?.view === 'dashboard' && Boolean(from?.url.searchParams.get('account'));
    const toAccount = to?.params?.view === 'dashboard' && Boolean(to?.url.searchParams.get('account'));
    if (!fromAccount && toAccount) openedFromChat = from?.params?.view === 'chat';
    else if (!toAccount) openedFromChat = false;

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

  afterNavigate(({ from, to }) => {
    const requestedId = to?.url.searchParams.get('customer');
    const customerChanged = requestedId && requestedId !== activeCustomerId &&
      requestedId !== from?.url.searchParams.get('customer');
    if (!guestChat && (from?.route.id !== to?.route.id || customerChanged)) {
      if (requestedId && customers.some((customer) => customer.id === requestedId)) {
        customersSeq++;
        customersLoading = false;
        activateCustomer(requestedId);
      } else {
        void loadCustomers();
      }
    } else if (!guestChat && from?.url.searchParams.get('topic') === 'open-account') {
      if (activeCustomerId) void loadSnapshot(activeCustomerId);
      else void loadCustomers();
    }

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
    if (!inChat) void goto(customerHref('/chat', routeCustomerId), { keepFocus: true });
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
  onMount(() => {
    // ClimateWise "Make a plan with Eno" links arrive as /dashboard?ask=<prompt>.
    const ask = page.url.searchParams.get('ask')?.trim();
    if (ask) {
      // Replace the ?ask= history entry so Back doesn't re-send the prompt.
      chatPrompt = { text: ask, id: ++promptSeq };
      void goto(customerHref('/chat', page.url.searchParams.get('customer')), { replaceState: true, keepFocus: true });
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

    const composerMedia = window.matchMedia('(max-width: 640px)');
    compactComposer = composerMedia.matches;
    const onComposerMediaChange = (event: MediaQueryListEvent) => {
      compactComposer = event.matches;
    };
    composerMedia.addEventListener('change', onComposerMediaChange);

    // Keep the chat band sized to the visual viewport so the composer stays
    // above the on-screen keyboard. `interactive-widget=resizes-content` in
    // app.html is the progressive enhancement; visualViewport is the fallback.
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let lastHeight = -1;
    let lastOffset = -1;
    let lastKeyboardOpen: boolean | null = null;
    const applyViewport = () => {
      const metrics = chatViewportMetrics(
        window.innerHeight,
        viewport?.height ?? window.innerHeight,
        viewport?.offsetTop ?? 0
      );
      if (metrics.height !== lastHeight) {
        lastHeight = metrics.height;
        root.style.setProperty('--chat-viewport-height', `${metrics.height}px`);
      }
      if (metrics.offsetTop !== lastOffset) {
        lastOffset = metrics.offsetTop;
        root.style.setProperty('--chat-viewport-offset', `${metrics.offsetTop}px`);
      }
      if (metrics.keyboardOpen !== lastKeyboardOpen) {
        lastKeyboardOpen = metrics.keyboardOpen;
        keyboardOpen = metrics.keyboardOpen;
      }
    };
    applyViewport();
    viewport?.addEventListener('resize', applyViewport);
    viewport?.addEventListener('scroll', applyViewport);
    window.addEventListener('resize', applyViewport);

    return () => {
      media.removeEventListener('change', onMediaChange);
      composerMedia.removeEventListener('change', onComposerMediaChange);
      viewport?.removeEventListener('resize', applyViewport);
      viewport?.removeEventListener('scroll', applyViewport);
      window.removeEventListener('resize', applyViewport);
    };
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

{#snippet arrowIcon()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 18 18 6M8 6h10v10"/></svg>
{/snippet}

{#snippet chevronIcon()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
{/snippet}

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div class="dashboard" class:chat={inChat} class:setup-composer-background={inChat} class:keyboard-open={keyboardOpen} class:view-open={walletView !== null} data-theme={theme}>
  <div class="dashboard-body" inert={walletView !== null}>
    <div class="wallet-band" style:--composer-half-height={`${composerHeight / 2}px`}>
      <div class="wallet-gradient" bind:this={gradient} aria-hidden="true"></div>
      <div class="container header-inner" class:wallet-chat-header={inChat}>
        <a class="brand" href={dashboardHref}><CapitalOneLogo label="Capital One dashboard" /></a>
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
              <CustomerDropdown id="account-dropdown" {customers} dark={isDark} activeId={activeCustomerId}
                loading={customersLoading} error={customersError} onretry={loadCustomers} onselect={selectCustomer}
                onsignout={handleSignOut} {signingOut} {signOutError} />
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
          {#if inChat}
            <a class="chat-exit" href={guestChat ? '/' : dashboardHref} aria-label={guestChat ? 'Back to home' : 'Back to dashboard'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
            </a>
          {/if}
        </div>
        <main class="chat-results" aria-label="Wallet chat" hidden={!inChat} bind:this={chatResults}>
          <ChatPanel
            bind:this={chatPanel}
            open={inChat}
            customerId={guestChat ? GUEST_CUSTOMER_ID : activeCustomerId}
            initialPrompt={chatPrompt}
            bind:canSend
            variant={isDark ? 'dark' : 'light'}
            accounts={displayAccounts}
            onClose={() => void goto(dashboardHref)}
          />
        </main>
        <div class="composer-area">
          <form class="composer" class:message-composer={inChat} bind:this={composer} bind:offsetHeight={composerHeight} onsubmit={search}>
            <div class="composer-field" data-value={query || composerPlaceholder}>
              <textarea bind:value={query} onfocus={openChat} onkeydown={handleComposerKeydown} rows="1" aria-label="Ask Capital One" placeholder={composerPlaceholder}></textarea>
            </div>
            <button class="send" class:primary={!inChat} class:message-send={inChat} aria-label="Ask" disabled={!query.trim() || (inChat && !canSend)}>
              {#if inChat}
                <span aria-hidden="true">↑</span>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>
              {/if}
            </button>
          </form>
        </div>
      </div>
    </div>

    {#if !guestChat}
      <main class="account-overview" aria-label="Account overview" inert={inChat} hidden={inChat && !coveringDashboard}
        style:--dashboard-header-height={`${dashboardHeaderHeight}px`}>
        <div class="container content">
          <section class="stack" aria-labelledby="accounts-title">
            <h2 id="accounts-title" class="section-title">Your accounts</h2>
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
                <a class="primary" href={openAccountsHref}>Open a new account {@render arrowIcon()}</a>
              </article>
            {:else}
              {#each displayAccounts as account (account.id)}
                {@const [dollars, cents] = account.balance.split('.')}
                <article class="account" style:--product-gradient={account.product?.gradient} style:--product-ink={account.product?.ink} id={'account-' + account.id}>
                  <div class="account-top">
                    <h3>{account.name} <span>•• {account.ending}</span></h3>
                    <div class="card-actions">
                      <button class="pill" onclick={() => openAccountView(account.id, 'activity')}>{@render arrowIcon()} View activity</button>
                    </div>
                  </div>
                  <div class="account-balance">
                    <div class="balance" aria-live="polite">
                      ${dollars}<span class="cents">.{cents}</span>
                    </div>
                    <div class="balance-label">
                      {account.kind}
                      {#if account.scheduled}
                        <ScheduledPaymentInfo text={account.scheduled} />
                      {/if}
                    </div>
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
                    <button class="activity-row" onclick={() => openAccountView(primaryCheckingId, 'activity', transaction.id)}>
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

            {#if liveAccounts.length > 0 && upcoming.length}
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
          </section>

          <section class="stack tools" aria-labelledby="tools-title">
            <h2 id="tools-title" class="section-title">Your tools</h2>

            {#if liveAccounts.length > 0}
            <div class="score-cards">
              <ClimateWiseWidget href={customerHref('/climatewise', routeCustomerId)} refresh={snapshotVersion} customerId={snapshotCustomerId || routeCustomerId} accountIds={liveAccounts.map((account) => account.id)} onAsk={() => send('What is my LORAXⓇ Score?')} />
              <ScoreCard
                title="CreditWise"
                logoLight={creditWiseLogoLight}
                logoDark={creditWiseLogoDark}
                score={creditScore}
                rating={creditRating.label}
                scoreLabel={`Demo credit score: ${creditScore} out of 850, ${creditRating.label}`}
                color={creditRating.color}
                progress={creditGaugeProgress}
                note="Demo score"
                href="https://www.capitalone.com/creditwise/"
                linkLabel="Check your FICO® Score"
              >
                {#snippet description()}Review your credit report for signs of error, theft or fraud.{/snippet}
              </ScoreCard>
            </div>
            <article class="panel feature products">
              <div class="feature-main">
                <div><h2>Explore other products</h2><p class="muted">Find an account that’s right for you.</p></div>
                <a class="link" href={openAccountsHref}>Open a new account {@render chevronIcon()}</a>
              </div>
            </article>
            {:else if !snapshotLoading && !snapshotError}
              <article class="panel utility getting-started">
                <h2>Make yourself at home.</h2>
                <p class="muted">Questions about banking? Wondering where to start? You don’t need an account to say hello.</p>
                <button class="link" onclick={() => send('I’m new here. What can I do with Eno?')}>Let’s get acquainted {@render arrowIcon()}</button>
              </article>
            {/if}
            <article class="panel feature">
              <div class="feature-main">
                <h2>ATM locator</h2>
                <button class="link" onclick={() => send("ATM's near me")}>Find ATMs near me {@render arrowIcon()}</button>
              </div>
            </article>
            {#if activeCustomerId && activeCustomerId !== GUEST_CUSTOMER_ID && !snapshotLoading && !snapshotError}
              <article class="panel feature">
                <div class="feature-main">
                  <div><h2>Close profile</h2><p class="muted">Close this demo profile and all its accounts.</p></div>
                  <button class="link" onclick={confirmProfileClosure}>Close profile {@render chevronIcon()}</button>
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
    {@const { accountId, tab } = walletView}
    <ViewShell
      title="Account details"
      subtitle={activeName}
      backLabel={openedFromChat ? 'Return to chat' : 'Back to dashboard'}
      onBack={closeAccountView}
    >
      {#snippet children(heading)}
        <AccountDetailView
          {accountId}
          {tab}
          {heading}
          customerId={routeCustomerId}
          onTabChange={(nextTab) => openAccountView(accountId, nextTab)}
          {focusTransactionId}
          onAccountDeleted={handleAccountDeleted}
        />
      {/snippet}
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
    --surface: var(--dark, #242424) var(--light, #fff);
    --ink: var(--dark, #f2f2f2) var(--light, #142632);
    --muted: var(--dark, #bdbdbd) var(--light, #50636e);
    --border: var(--dark, #414141) var(--light, #dae3e8);
    --button: var(--dark, #e5e5e5) var(--light, #123f56);
    --button-text: var(--dark, #202020) var(--light, #fff);
    --page: var(--dark, #171717) var(--light, #f4f6f8);
    --banner: var(--dark, #333333) var(--light, #ecf4f7);
    min-height: 100vh;
    background: var(--page);
    color: var(--ink);
    color-scheme: var(--dark, dark) var(--light, light);
    font: 15px/1.45 var(--font-sans);
  }
  .dashboard:not(.chat) { --link: var(--dark, #9fdbf0) var(--light, #075e80); }
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
  .composer-area { grid-column: 2; grid-row: 1; }
  .chat .account-overview {
    position: absolute;
    inset: var(--dashboard-header-height) 0 auto;
  }
  .account-overview[hidden] { display: none; }
  .chat .dashboard-body { overflow: clip; }
  .chat .header-inner {
    width: min(1200px, calc(100% - 72px));
    height: 100%;
    grid-template-rows: var(--setup-header-height) minmax(0, 1fr) auto;
    row-gap: 0;
    padding-block: 0;
  }
  .chat .header-inner::before { inset: 0 -36px auto; height: calc(var(--setup-header-height) + 42px); }
  .chat .header-inner::after { inset: 0 -36px auto; height: calc(var(--setup-header-height) + 12px); }
  .chat .header-inner::before, .chat .header-inner::after { z-index: 1; pointer-events: none; }
  .chat .header-inner .brand, .chat .header-actions {
    z-index: 2;
    align-self: center;
    margin-top: 0;
  }
  .chat .brand :global(svg) { width: 110px; height: 40px; }
  .chat .header-actions { gap: 16px; color: var(--ink); }
  .chat .theme-toggle, .chat-exit {
    display: grid;
    place-items: center;
    flex: none;
    width: 38px;
    height: 38px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: transparent;
  }
  .chat-exit { color: var(--muted); }
  .chat-exit:hover, .chat .theme-toggle:hover { background: var(--surface); }
  .chat-exit svg { width: 20px; height: 20px; }
  .dashboard.chat {
    min-height: var(--chat-viewport-height, 100dvh);
    font: 15px/1.65 var(--font-sans);
  }
  .dashboard.chat::before { content: none; }
  .chat .composer-area {
    grid-column: 1 / -1;
    grid-row: 3;
    position: relative;
    z-index: 2;
    justify-self: center;
    width: min(800px, calc(100% + 72px));
    padding-bottom: var(--composer-bottom-padding);
  }
  .chat-results {
    grid-column: 1 / -1;
    width: min(800px, calc(100% + 72px));
    justify-self: center;
    grid-row: 2;
    align-self: stretch;
    min-height: 0;
  }
  .brand { display: inline-flex; flex: none; padding: 3px 8px; margin-left: -8px; border-radius: 8px; color: var(--dark, #fff) var(--light, #013d5b); }
  .brand :global(svg) { display: block; width: 122px; height: 44px; }
  .link { background: transparent; border: 0; padding: 0; }
  footer a:hover { text-decoration: underline; }
  button.link:hover { color: var(--ink); }
  .profile {
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
  .dashboard:not(.chat) .header-actions {
    --page: var(--dark, #10191f) var(--light, #f4f6f8);
    --surface: var(--dark, #18252d) var(--light, #fff);
    --border: var(--dark, #31444f) var(--light, #dae3e8);
    --ink: var(--dark, #ecf3f6) var(--light, #142632);
    --banner: var(--dark, #1b313b) var(--light, #ecf4f7);
    color: var(--ink);
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
  .profile:hover, .profile[aria-expanded='true'] { background: var(--surface); }
  .avatar { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--banner); color: var(--link); }
  .profile .chevron { width: 13px; height: 13px; color: var(--muted); }
  .profile[aria-expanded='true'] .chevron { rotate: 180deg; }
  .account-menu { position: relative; }
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
  .chat .wallet-band {
    height: var(--chat-viewport-height, 100dvh);
    transform: translateY(var(--chat-viewport-offset, 0px));
    --composer-bottom-padding: var(--composer-bottom-space);
  }
  .chat.keyboard-open .wallet-band { --composer-bottom-padding: 12px; }
  .wallet-gradient {
    --composer-gradient-center: calc(100% - var(--composer-bottom-padding) - var(--composer-half-height));
    position: absolute;
    inset: 0 0 auto;
    height: 100%;
    box-sizing: border-box;
    pointer-events: none;
    border-bottom: 1px solid var(--border);
  }
  .chat .wallet-gradient { border-color: transparent; }
  .composer { position: relative; z-index: 1; }
  .composer:not(.message-composer) { background: var(--surface); border: 1px solid var(--border); border-radius: 28px; box-shadow: 0 8px 24px #102b421c; }
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
  .composer:not(.message-composer) textarea::placeholder { color: var(--muted); }
  .composer:not(.message-composer) .send { position: absolute; right: 8px; top: 8px; width: 40px; height: 40px; min-height: 40px; border-radius: 50%; padding: 0; }
  .chat .composer-field { flex: 1; min-width: 0; margin-right: 0; }
  .chat .composer-field::after, .chat .composer textarea {
    padding: 9px 0;
    font-size: 16px;
  }
  .send:disabled { opacity: .55; cursor: default; }
  .link { display: inline-flex; align-items: center; gap: 5px; color: var(--link); font-weight: 650; text-align: left; }
  .link :global(svg) { width: 15px; height: 15px; }

  .content {
    display: grid;
    grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr);
    align-items: start;
    gap: 20px;
    padding-block: 24px 40px;
  }
  .content > footer { grid-column: 1 / -1; }
  .stack { display: grid; gap: 14px; }
  .score-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .section-title { font-size: 23px; }
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
    align-items: start;
    column-gap: 20px;
    padding: 17px 20px;
    border-radius: 15px;
    color: var(--product-ink, #fff);
    background: var(--product-gradient, linear-gradient(115deg, #252525, #484848));
    scroll-margin-top: 18px;
  }
  .account-top h3 { margin: 0; font-size: 21px; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }
  .account-top h3 span { color: currentColor; font-size: 12px; margin-left: 4px; white-space: nowrap; }
  .account-balance { align-self: center; display: grid; gap: 4px; text-align: right; }
  .balance-label { display: flex; align-items: center; justify-content: flex-end; gap: 6px; color: currentColor; font-size: 12px; }
  .account :is(a, button):focus-visible { outline-color: currentColor; }
  .balance { font-size: clamp(26px, 4vw, 36px); line-height: 1; font-weight: 550; font-variant-numeric: tabular-nums; letter-spacing: -.045em; }
  .cents { color: currentColor; font-size: .69em; letter-spacing: -.03em; }
  .card-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: 8px;
    margin-top: 8px;
  }
  .card-actions .pill { width: 10rem; max-width: 100%; }
  .pill, .primary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 13px; min-height: 38px; font-size: 13px; font-weight: 650; }
  .pill {
    background: color-mix(in srgb, currentColor 5%, transparent);
    backdrop-filter: blur(2px);
    border: 1px solid color-mix(in srgb, currentColor 50%, transparent);
    border-radius: 8px;
  }
  .primary { background: var(--button); border: 1px solid transparent; color: var(--button-text); border-radius: 10px; text-align: center; }
  .primary:hover { opacity: .88; }
  .primary:disabled { opacity: .55; cursor: default; }

  .panel { background: var(--surface); border-radius: 16px; overflow: hidden; }
  .feature { display: flex; flex-direction: column; }
  .feature-main { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 20px 22px; flex: 1; }
  .feature-main .link { color: var(--link); font-size: 13px; }
  .feature-main .link:hover { text-decoration: underline; }
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
  .close-profile-dialog::backdrop { background: var(--dark, #0009) var(--light, #0b182399); }
  .close-profile-dialog p { margin-top: 12px; }
  .close-profile-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 20px; }
  .close-profile-actions button:disabled { opacity: 0.65; cursor: default; }
  .products p { margin-top: 5px; }
  .muted, footer { color: var(--muted); }
  .utility { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 17px; min-height: 172px; }
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
    .header-inner .brand { margin-top: 0; }
    .header-actions { grid-column: 2; grid-row: 1; justify-self: end; margin-top: 0; }
    .composer-area, .chat-results {
      grid-column: 1 / -1;
      grid-row: 2;
    }
    .dashboard:not(.chat) .header-inner { row-gap: 0; }
    .dashboard:not(.chat) .composer-area { margin-top: 28px; }
    .dashboard:not(.chat) .composer-area { width: min(720px, 100%); justify-self: center; }
    .content { grid-template-columns: minmax(0, 1fr); }
  }
  @container (max-width: 600px) {
    .chat .header-inner { width: calc(100% - 36px); }
    .chat .header-inner::before, .chat .header-inner::after { inset-inline: -18px; }
    .chat .header-actions { gap: 10px; }
    .chat .brand :global(svg) { width: 94px; height: 34px; }
    .chat .chat-results, .chat .composer-area { width: calc(100% + 36px); }
  }
  @container (max-width: 380px) {
    .chat .profile-name { display: none; }
  }
  @container (max-width: 570px) {
    .container { width: calc(100% - 28px); }
    .wallet-band { --composer-bottom-padding: 20px; }
    .header-inner { padding-block: 20px; }
    .dashboard:not(.chat) .composer-area { margin-top: 20px; }
    .brand :global(svg) { width: 94px; height: 36px; }
    .content { padding-top: 18px; gap: 12px; }
    .account { padding-inline: 14px; column-gap: 9px; }
    .account-top { display: contents; }
    .account-top h3 { font-size: 18px; }
    .card-actions {
      grid-area: 2 / 1 / 3 / -1;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .card-actions .pill { width: 100%; padding-inline: 8px; }
    .feature-main { padding-inline: 17px; }
  }
</style>
