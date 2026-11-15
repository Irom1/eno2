<script lang="ts">
  import { createSentMessageMotion } from '$lib/sentMessageMotion';
  const sentMotion = createSentMessageMotion();
  import { onDestroy, onMount, tick } from 'svelte';
  import { readAloud, stopReadAloud, supportsReadAloud } from '$lib/chat/readAloud';
  import { ENO_INTRO } from '$lib/chat/intro';
  import ReadAloudButton from '$lib/components/ReadAloudButton.svelte';
  import { renderMarkdown } from '$lib/markdown.js';
  import { createSseParser } from '$lib/sse.js';
  import {
    accountCard,
    accountCards,
    anchorEntityCards,
    anomalyExplanation,
    anomalyTransactionCards,
    completeAnomalyContext,
    billCard,
    billListCard,
    cashflowCard,
    climateWiseCard,
    goalCard,
    loanCard,
    locationCard,
    merchantCard,
    mergeEntityCards,
    mergeTransactionListCards,
    profileCard,
    recurringCard,
    rewardCard,
    spendingPieCard,
    topMerchantCard,
    transactionListCard,
    type EntityCard,
    type SpendingPieEntityCard,
    type TransactionListEntityCard
  } from '$lib/chat/entityCards.js';
  import { inlineBlocks, revealInlineCards } from '$lib/chat/inline.js';
  import { followUpsFor } from '$lib/chat/followUps.js';
  import { STARTER_PROMPTS } from '$lib/chat/starters.js';
  import { GUEST_CUSTOMER_ID } from '$lib/chat/guest';
  import { fetchWithSession, recoverSession } from '$lib/sessionRecovery';
  import {
    prefetchAccountDetail,
    prefetchSnapshot,
    prefetchTransactionContext
  } from '$lib/walletCache';
  import { classifyIntents, wantsTopEmittingPurchases } from '$lib/chat/intents.js';
  import { shouldInferTransactionList } from '$lib/chat/transactionListIntent.js';
  import { isConversationFollowUp, requestsExplanationOnly } from '$lib/chat/requestScope.js';
  import type { EnoVariant } from '$lib/eno.js';
  import EnoThinking from '$lib/components/EnoThinking.svelte';
  import { groupInlineCards } from '$lib/chat/cardGroups.js';
  import FollowUps from './FollowUps.svelte';
  import ChatCardView from './inline-cards/ChatCardView.svelte';

  interface Props {
    open: boolean;
    customerId: string;
    initialPrompt: { text: string; id: number } | null;
    onClose: () => void;
    canSend: boolean;
    hasUserMessage?: boolean;
    variant?: EnoVariant;
    accounts?: Array<{ id?: string; nickname?: string; type?: string }>;
  }

  interface ChatMessage {
    id: number;
    role: 'user' | 'assistant';
    text: string;
    prompt?: string;
    pending?: boolean;
    inlineCards?: EntityCard[];
    intro?: boolean;
  }

  let {
    open,
    customerId,
    initialPrompt,
    onClose,
    canSend = $bindable(),
    hasUserMessage = $bindable(false),
    variant = 'light',
    accounts = []
  }: Props = $props();

  let ready = $state(false);
  let booting = $state(false);
  let bootPromise: Promise<boolean> | null = null;
  let bootTarget = '';
  let sessionCustomerId = $state('');

  let messageSeq = 0;

  function introMessage(): ChatMessage {
    const text = customerId === GUEST_CUSTOMER_ID
      ? "Hi, I'm Eno 2.0. I can help you explore how to open an account."
      : ENO_INTRO;
    return { id: ++messageSeq, role: 'assistant', text, intro: true, pending: false };
  }

  let messages = $state<ChatMessage[]>([introMessage()]);
  let streaming = $state(false);
  let status = $state('');
  let requestSeq = 0;
  let cardSeq = 0;
  let lastPromptId = 0;
  let inFlightPromptId = 0;
  let speechSupported = $state(false);
  let speechNotice = $state('');
  let speaking = false;

  onMount(() => {
    speechSupported = supportsReadAloud();
  });

  function stopSpeech(): void {
    stopReadAloud();
    speaking = false;
    speechNotice = '';
  }

  onDestroy(stopSpeech);

  function speak(text: string): void {
    stopSpeech();
    const content = document.createElement('div');
    content.innerHTML = renderMarkdown(text);
    for (const block of content.querySelectorAll('p, li, h3, br')) block.after(' ');
    speaking = true;
    void readAloud(
      content.textContent?.trim() ?? '',
      (notice) => { speechNotice = notice; speaking = false; },
      () => { speaking = false; }
    );
  }


  const conversationHasUserMessage = $derived(messages.some((message) => message.role === 'user'));

  const suggestions = $derived.by(() => {
    if (streaming || customerId === GUEST_CUSTOMER_ID) return [];
    if (!conversationHasUserMessage) return [...STARTER_PROMPTS];
    const last = [...messages].reverse().find((message) => message.role === 'assistant');
    if (!last || last.pending) return [];
    const cards = last.inlineCards ?? [];
    if (!last.text && cards.length === 0) return [];
    return followUpsFor(cards, last.prompt ?? '', last.text, accounts).slice(0, 3);
  });

  function scrollToLatest(): void {
    void tick().then(() => {
      if (open) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    });
  }

  async function openSession(id: string): Promise<boolean> {
    try {
      if (!(await recoverSession(id))) throw new Error('Could not start a session.');
      sessionCustomerId = id;
      ready = true;
      status = '';
      return true;
    } catch {
      ready = false;
      status = 'Unable to connect right now.';
      return false;
    }
  }

  async function runEnsureSession(id: string): Promise<boolean> {
    if (ready) {
      stopSpeech();
      requestSeq += 1;
      streaming = false;
      messages = [introMessage()];
      status = '';
      try {
        await fetch('/api/session', { method: 'DELETE' });
      } catch {
        // The new session below is the source of truth.
      }
      ready = false;
    }
    return openSession(id);
  }

  async function ensureSession(id: string): Promise<boolean> {
    if (!id) return false;
    if (ready && sessionCustomerId === id) return true;
    if (bootPromise) {
      if (bootTarget === id) return bootPromise;
      await bootPromise;
      if (ready && sessionCustomerId === id) return true;
      return ensureSession(id);
    }

    bootTarget = id;
    booting = true;
    bootPromise = (async () => {
      try {
        return await runEnsureSession(id);
      } finally {
        booting = false;
        bootPromise = null;
        bootTarget = '';
      }
    })();
    return bootPromise;
  }

  /**
   * Imperative send used by the page's top composer on `/chat`: waits for the
   * session to exist for this customer, then sends exactly one chat request.
   */
  export async function ask(text: string): Promise<void> {
    const value = text.trim();
    if (!value) return;
    const ok = await ensureSession(customerId);
    if (ok) await send(value);
  }

  function findMessage(id: number): ChatMessage | undefined {
    return messages.find((message) => message.id === id);
  }

  /** Keep one card per kind in a turn: later insights replace, never stack. */
  function replaceInlineCard(message: ChatMessage, incoming: EntityCard): void {
    const current = message.inlineCards ?? [];
    const exists = current.some((card) => card.kind === incoming.kind);
    message.inlineCards = exists
      ? current.map((card) => (card.kind === incoming.kind ? incoming : card))
      : [...current, incoming];
    cardSeq = Math.max(cardSeq, incoming.id);
  }

  /**
   * A turn shows either one single bill card or one bill list, never both.
   * Replace the first bill-family card in place and drop any extra so an
   * earlier insight cannot leave a stale single card next to the list.
   */
  function replaceBillCard(message: ChatMessage, incoming: EntityCard): void {
    const current = message.inlineCards ?? [];
    const exists = current.some(
      (card) => card.kind === 'bill' || card.kind === 'bill-list'
    );
    if (!exists) {
      message.inlineCards = [...current, incoming];
      cardSeq = Math.max(cardSeq, incoming.id);
      return;
    }
    let placed = false;
    const next: EntityCard[] = [];
    for (const card of current) {
      if (card.kind === 'bill' || card.kind === 'bill-list') {
        if (!placed) {
          next.push(incoming);
          placed = true;
        }
        continue;
      }
      next.push(card);
    }
    message.inlineCards = next;
    cardSeq = Math.max(cardSeq, incoming.id);
  }

  const SUPPORTED_CARD_KINDS = new Set<EntityCard['kind']>([
    'transaction',
    'transaction-list',
    'spending-pie',
    'bill',
    'bill-list',
    'account',
    'loan',
    'location',
    'recurring',
    'reward',
    'goal',
    'cashflow',
    'merchant',
    'profile',
    'climatewise'
  ]);

  /** Ignore unknown future card kinds instead of rendering a broken card. */
  function isSupportedCardKind(kind: string): kind is EntityCard['kind'] {
    return SUPPORTED_CARD_KINDS.has(kind as EntityCard['kind']);
  }

  function positiveTotalRewards(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    const total = (payload as Record<string, unknown>).totalRewards;
    return typeof total === 'number' && Number.isFinite(total) && total > 0;
  }

  /** Fill missing explanations, including charges omitted from otherwise nonempty prose. */
  function ensureExplanation(message: ChatMessage): void {
    const cards = message.inlineCards ?? [];
    if (cards.some((card) => card.kind === 'transaction' && card.payload.flag)) {
      const original = message.text.trim();
      message.text = original ? completeAnomalyContext(original, cards) : anomalyExplanation(cards);
      if (original && message.text !== original && !/\b(?:you can|review|check|report|recognize|dispute|contact)\b/i.test(original)) {
        message.text += '\n\nYou can review these charges and report anything you don’t recognize.';
      }
      return;
    }
    if (message.text.trim() || cards.length === 0) return;
    if (cards.some((card) => card.kind === 'transaction-list')) {
      message.text = 'Here are your recent transactions, with the most recent first.';
      return;
    }
    message.text = anomalyExplanation(cards);
  }

  function markError(id: number, notice = 'Something went wrong. Please try again.'): void {
    const message = findMessage(id);
    if (!message) return;
    message.text = message.text ? `${message.text}\n\n${notice}` : notice;
    message.pending = false;
  }

  async function send(text: string): Promise<boolean> {
    const value = text.trim();
    if (!value || !ready || streaming) return false;
    sentMotion.capture();

    stopSpeech();
    const requestId = ++requestSeq;
    const userId = ++messageSeq;
    const assistantId = ++messageSeq;
    messages.push({ id: userId, role: 'user', text: value });
    messages.push({ id: assistantId, role: 'assistant', text: '', prompt: value, pending: true });
    streaming = true;
    status = '';
    scrollToLatest();

    try {
      const response = await fetchWithSession('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: value })
      }, customerId);
      if (!response.ok || !response.body) {
        // A stale cookie surfaces as 401 "No active session"; the wrapper already
        // tried to recover. Keep the customer-facing copy generic either way.
        markError(
          assistantId,
          response.status === 401 ? 'Reconnecting failed — try again.' : undefined
        );
        return false;
      }

      const parser = createSseParser((event) => {
        if (requestId !== requestSeq) return;
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(event.data) as Record<string, unknown>;
        } catch {
          return;
        }
        const message = findMessage(assistantId);
        if (!message) return;

        switch (event.event) {
          case 'text':
            if (typeof data.delta === 'string') {
              message.text += data.delta;
              status = '';
              scrollToLatest();
            }
            break;
          case 'insight': {
            if (typeof data.kind !== 'string') break;
            const payload = data.payload;
            const accountId = typeof data.accountId === 'string' ? data.accountId : '';
            const intents = classifyIntents(message.prompt ?? '');
            if (customerId !== GUEST_CUSTOMER_ID) {
              // Warm the deep-link payloads while the customer reads the answer.
              // These are fire-and-forget so streaming and card rendering never wait.
              const record =
                payload && typeof payload === 'object' && !Array.isArray(payload)
                  ? (payload as Record<string, unknown>)
                  : {};
              if (
                data.kind === 'nessie_list_account_deposits' ||
                data.kind === 'nessie_list_account_withdrawals' ||
                data.kind === 'nessie_list_account_transactions' ||
                data.kind === 'insight_top_transactions' ||
                data.kind === 'insight_top_merchants'
              ) {
                if (accountId) void prefetchTransactionContext(customerId, accountId);
              }
              if (data.kind === 'insight_anomalies') {
                const findings = Array.isArray(record.findings)
                  ? (record.findings as Array<Record<string, unknown>>)
                  : [];
                const ids = new Set<string>();
                if (accountId) ids.add(accountId);
                for (const finding of findings) {
                  if (
                    finding &&
                    typeof finding === 'object' &&
                    typeof finding.accountId === 'string' &&
                    finding.accountId
                  ) {
                    ids.add(finding.accountId);
                  }
                  if (ids.size >= 4) break;
                }
                for (const id of ids) void prefetchAccountDetail(id);
                void prefetchSnapshot(customerId);
              }
            }
            if (data.kind === 'insight_anomalies' && !requestsExplanationOnly(message.prompt ?? '') && (!isConversationFollowUp(message.prompt ?? '') || (payload && typeof payload === 'object' && 'assessment' in payload))) {
              // If the tool result arrives before any prose, anchor the cards at
              // the end of the text so the answer reads first and the cited
              // charges follow it. If an intro already exists, anchor inline.
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              const startId = cardSeq + 1;
              const incoming = anomalyTransactionCards(payload, anchor, startId, {
                accountId,
                customerId
              });
              cardSeq += incoming.length;
              message.inlineCards = mergeEntityCards(message.inlineCards ?? [], incoming);
            }
            if (
              data.kind === 'insight_spending_breakdown' &&
              !intents.has('merchants')
            ) {
              // One primitive pie card per turn: a later spending insight in the
              // same turn replaces the earlier one rather than stacking charts.
              // A merchant question is answered by one merchant card, not a pie.
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              const incoming = spendingPieCard(payload, anchor, cardSeq + 1);
              if (incoming) {
                const existing = (message.inlineCards ?? []).some(
                  (card): card is SpendingPieEntityCard => card.kind === 'spending-pie'
                );
                message.inlineCards = existing
                  ? (message.inlineCards ?? []).map((card) =>
                      card.kind === 'spending-pie' ? incoming : card
                    )
                  : [...(message.inlineCards ?? []), incoming];
                cardSeq = Math.max(cardSeq, incoming.id);
              }
            }
            if (data.kind === 'insight_upcoming_bills') {
              // One bill family card per turn: a single bill keeps its inline
              // card, while multiple due bills become one standalone list in the
              // tool's order. A later insight replaces the earlier card.
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              const bills =
                payload && typeof payload === 'object' && !Array.isArray(payload)
                  ? (payload as Record<string, unknown>).bills
                  : undefined;
              const incoming =
                Array.isArray(bills) && bills.length > 1
                  ? billListCard(payload, anchor, cardSeq + 1, { customerId })
                  : billCard(payload, anchor, cardSeq + 1, { customerId });
              if (incoming) replaceBillCard(message, incoming);
            }
            if (data.kind === 'nessie_get_account') {
              // Accounts are single-entity cards; an all-accounts list stays in
              // prose, and a later account insight replaces the earlier card.
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              const incoming = accountCard(payload, anchor, cardSeq + 1, { customerId });
              if (incoming) {
                const existing = (message.inlineCards ?? []).some(
                  (card) => card.kind === 'account'
                );
                message.inlineCards = existing
                  ? (message.inlineCards ?? []).map((card) =>
                      card.kind === 'account' ? incoming : card
                    )
                  : [...(message.inlineCards ?? []), incoming];
                cardSeq = Math.max(cardSeq, incoming.id);
              }
            }
            if (
              data.kind === 'nessie_list_customer_accounts' &&
              intents.has('accounts') &&
              !intents.has('credit')
            ) {
              // An explicit accounts-list question renders one account card per
              // account in the tool's order. A credit-card-only question stays
              // in prose (or its one matching card), and other card kinds from
              // the same payload (for example a reward card) are preserved.
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              const incoming = accountCards(payload, anchor, cardSeq + 1, { customerId });
              if (incoming.length > 0) {
                const otherCards = (message.inlineCards ?? []).filter(
                  (card) => card.kind !== 'account'
                );
                message.inlineCards = [...otherCards, ...incoming];
                cardSeq = Math.max(cardSeq, ...incoming.map((card) => card.id));
              }
            }
            if (data.kind === 'nessie_list_account_loans') {
              // One primitive loan card per turn: the largest balance wins, and
              // a later loan insight replaces the earlier card.
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              const incoming = loanCard(payload, anchor, cardSeq + 1, { customerId });
              if (incoming) {
                const existing = (message.inlineCards ?? []).some(
                  (card) => card.kind === 'loan'
                );
                message.inlineCards = existing
                  ? (message.inlineCards ?? []).map((card) =>
                      card.kind === 'loan' ? incoming : card
                    )
                  : [...(message.inlineCards ?? []), incoming];
                cardSeq = Math.max(cardSeq, incoming.id);
              }
            }
            if (
              data.kind === 'find_nearby_atms' ||
              data.kind === 'find_nearby_branches'
            ) {
              // One primitive location card per turn: the first result is shown,
              // and a later location insight replaces the earlier card.
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              const incoming = locationCard(payload, anchor, cardSeq + 1, {
                customerId,
                type: data.kind === 'find_nearby_atms' ? 'atm' : 'branch'
              });
              if (incoming) {
                const existing = (message.inlineCards ?? []).some(
                  (card) => card.kind === 'location'
                );
                message.inlineCards = existing
                  ? (message.inlineCards ?? []).map((card) =>
                      card.kind === 'location' ? incoming : card
                    )
                  : [...(message.inlineCards ?? []), incoming];
                cardSeq = Math.max(cardSeq, incoming.id);
              }
            }
            if (data.kind === 'insight_recurring_charges') {
              // One primitive recurring-charge card per turn: the largest
              // average amount wins, and a later insight replaces the card.
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              const incoming = recurringCard(payload, anchor, cardSeq + 1, { customerId });
              if (incoming) {
                const existing = (message.inlineCards ?? []).some(
                  (card) => card.kind === 'recurring'
                );
                message.inlineCards = existing
                  ? (message.inlineCards ?? []).map((card) =>
                      card.kind === 'recurring' ? incoming : card
                    )
                  : [...(message.inlineCards ?? []), incoming];
                cardSeq = Math.max(cardSeq, incoming.id);
              }
            }
            if (
              intents.has('rewards') &&
              (data.kind === 'nessie_list_customer_accounts' ||
                (data.kind === 'insight_financial_overview' && positiveTotalRewards(payload)))
            ) {
              // One primitive reward card per turn: the highest credit-account
              // reward, or the overview total. Later rewards replace it.
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              const incoming = rewardCard(payload, anchor, cardSeq + 1, { customerId });
              if (incoming) replaceInlineCard(message, incoming);
            }
            if (data.kind === 'insight_goal_projection') {
              // One primitive goal card per turn; a later projection replaces it.
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              const incoming = goalCard(payload, anchor, cardSeq + 1, { customerId });
              if (incoming) replaceInlineCard(message, incoming);
            }
            if (data.kind === 'insight_climatewise') {
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              if (wantsTopEmittingPurchases(message.prompt ?? '')) {
                // A ranked-purchases follow-up is a transaction list, not the
                // full report card again. The rows carry their own account ids.
                const source =
                  payload && typeof payload === 'object' && !Array.isArray(payload)
                    ? (payload as Record<string, unknown>)
                    : {};
                const report =
                  source.report && typeof source.report === 'object'
                    ? (source.report as Record<string, unknown>)
                    : source;
                const topPurchases = Array.isArray(report.topPurchases)
                  ? report.topPurchases
                  : [];
                if (topPurchases.length > 0) {
                  const incoming = transactionListCard(
                    { items: topPurchases, count: topPurchases.length },
                    anchor,
                    cardSeq + 1,
                    { customerId, cap: 8 }
                  );
                  if (incoming) {
                    // Drop any earlier full report card in this turn: the list
                    // is the answer, and the two must never stack.
                    const current = (message.inlineCards ?? []).filter(
                      (card) => card.kind !== 'climatewise'
                    );
                    const existing = current.find(
                      (card): card is TransactionListEntityCard =>
                        card.kind === 'transaction-list'
                    );
                    const merged = mergeTransactionListCards(existing, incoming);
                    message.inlineCards = existing
                      ? current.map((card) =>
                          card.kind === 'transaction-list' ? merged : card
                        )
                      : [...current, merged];
                    cardSeq = Math.max(cardSeq, merged.id);
                  }
                }
              } else {
                // One full ClimateWise card per turn; a later report replaces it.
                // The grouping layer renders it standalone, outside the prose bubble.
                const incoming = climateWiseCard(payload, anchor, cardSeq + 1, { customerId });
                if (incoming) replaceInlineCard(message, incoming);
              }
            }
            if (
              data.kind === 'insight_financial_overview' &&
              (intents.has('cashflow') || intents.has('overview'))
            ) {
              // One primitive cashflow month per turn: the latest complete
              // month, replaced rather than stacked if the insight repeats.
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              const incoming = cashflowCard(payload, anchor, cardSeq + 1);
              if (incoming) replaceInlineCard(message, incoming);
            }
            if (data.kind === 'insight_top_merchants') {
              // The answer is a single merchant card for the top merchant, not a
              // pie or a transaction list.
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              const incoming = topMerchantCard(payload, anchor, cardSeq + 1, { customerId });
              if (incoming) replaceInlineCard(message, incoming);
            }
            if (
              data.kind === 'nessie_list_merchants' ||
              data.kind === 'nessie_get_merchant'
            ) {
              // One primitive merchant per turn: the first valid merchant, with
              // a later merchant insight replacing the earlier card.
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              const incoming = merchantCard(payload, anchor, cardSeq + 1, { customerId });
              if (incoming) replaceInlineCard(message, incoming);
            }
            if (data.kind === 'nessie_get_customer') {
              // One primitive profile per turn, and only for a single-customer
              // payload; a customer list stays in prose. Later profiles replace.
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              const incoming = profileCard(payload, anchor, cardSeq + 1);
              if (incoming) replaceInlineCard(message, incoming);
            }
            if (
              (data.kind === 'nessie_list_account_deposits' ||
                data.kind === 'nessie_list_account_withdrawals' ||
                data.kind === 'nessie_list_account_transactions') &&
              shouldInferTransactionList(message.prompt ?? '', intents)
            ) {
              // Deposits and withdrawals in one turn share a single merged list.
              // Raw feeds are only rendered for recent/all-transaction prompts;
              // ranked or filtered questions use insight_top_transactions.
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              const incoming = transactionListCard(payload, anchor, cardSeq + 1, {
                accountId,
                customerId
              });
              if (incoming) {
                const existing = message.inlineCards?.find(
                  (card): card is TransactionListEntityCard =>
                    card.kind === 'transaction-list'
                );
                const merged = mergeTransactionListCards(existing, incoming);
                message.inlineCards = existing
                  ? (message.inlineCards ?? []).map((card) =>
                      card.kind === 'transaction-list' ? merged : card
                    )
                  : [...(message.inlineCards ?? []), merged];
                cardSeq = Math.max(cardSeq, merged.id);
              }
            }
            if (data.kind === 'insight_top_transactions' && !intents.has('merchants')) {
              // Its rows are already the exact ranked/filtered set, so a list
              // card is always accurate here. A merchant question uses the
              // merchant card instead of a transaction list.
              const anchor =
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER;
              const incoming = transactionListCard(payload, anchor, cardSeq + 1, {
                accountId,
                customerId
              });
              if (incoming) {
                const existing = message.inlineCards?.find(
                  (card): card is TransactionListEntityCard =>
                    card.kind === 'transaction-list'
                );
                const merged = mergeTransactionListCards(existing, incoming);
                message.inlineCards = existing
                  ? (message.inlineCards ?? []).map((card) =>
                      card.kind === 'transaction-list' ? merged : card
                    )
                  : [...(message.inlineCards ?? []), merged];
                cardSeq = Math.max(cardSeq, merged.id);
              }
            }
            scrollToLatest();
            break;
          }
          case 'card': {
            // Server-side present_card result: a normalized EntityCard payload.
            const raw = data.card;
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) break;
            const record = raw as Record<string, unknown>;
            if (typeof record.kind !== 'string' || !isSupportedCardKind(record.kind)) break;
            if (typeof record.entityId !== 'string' || !record.entityId) break;
            if (!record.payload || typeof record.payload !== 'object') break;

            const incoming = { ...record } as unknown as EntityCard;
            if (typeof incoming.id !== 'number' || !Number.isFinite(incoming.id)) {
              incoming.id = ++cardSeq;
            } else {
              cardSeq = Math.max(cardSeq, incoming.id);
            }
            if (
              typeof incoming.afterText !== 'number' ||
              !Number.isFinite(incoming.afterText)
            ) {
              incoming.afterText = message.text.length;
            }

            const current = message.inlineCards ?? [];
            // The bill list already covers every due bill in this turn; a
            // present_card single bill would duplicate one of its rows.
            if (
              incoming.kind === 'bill' &&
              current.some((card) => card.kind === 'bill-list')
            ) {
              scrollToLatest();
              break;
            }
            const index = current.findIndex(
              (card) => card.entityId === incoming.entityId
            );
            message.inlineCards =
              index >= 0
                ? current.map((card, position) => (position === index ? incoming : card))
                : [...current, incoming];
            scrollToLatest();
            break;
          }
          case 'error':
            markError(assistantId);
            break;
          case 'done':
            ensureExplanation(message);
            message.pending = false;
            streaming = false;
            status = '';
            break;
          default:
            break;
        }
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(chunk, { stream: true }));
      }
      parser.push(decoder.decode());
      parser.flush();
    } catch {
      markError(assistantId);
    } finally {
      const message = findMessage(assistantId);
      if (message) {
        ensureExplanation(message);
        message.pending = false;
      }
      if (requestId === requestSeq) {
        streaming = false;
        status = '';
      }
      scrollToLatest();
    }

    return true;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (open && event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      onClose();
    }
  }

  $effect(() => {
    if (open) void ensureSession(customerId);
  });

  $effect(() => {
    if (open) return stopSpeech;
  });

  $effect(() => {
    canSend = ready && !streaming;
  });

  $effect(() => {
    hasUserMessage = conversationHasUserMessage;
  });

  $effect(() => {
    const prompt = initialPrompt;
    const id = customerId;
    const isReady = ready;
    const isBusy = streaming;
    // Only flush the queued prompt once the chat view is actually open; on the
    // dashboard this effect re-runs after navigation flips `open` to true.
    if (!open) return;
    if (!prompt || prompt.id === lastPromptId) return;
    // Wait for the page to finish loading customers; this effect re-runs when
    // `customerId` becomes available.
    if (!id) return;
    // Never drop a queued prompt because a previous turn is still streaming,
    // and never consume it until it has actually been appended and sent.
    if (isBusy || inFlightPromptId === prompt.id) return;

    inFlightPromptId = prompt.id;
    void (async () => {
      try {
        const ok =
          isReady && sessionCustomerId === id ? true : await ensureSession(id);
        if (!ok) return;
        if (prompt.id === lastPromptId) return;
        const sent = await send(prompt.text);
        if (sent) lastPromptId = prompt.id;
      } finally {
        if (inFlightPromptId === prompt.id) inFlightPromptId = 0;
      }
    })();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="chat-panel"
  role="region"
  aria-label="Eno 2.0"
  data-streaming={streaming}
  inert={!open}
>
  <div class="chat-log" role="log" aria-relevant="additions text" aria-live="polite" aria-label="Conversation">
    {#if speechNotice}<p class="speech-notice" role="status">{speechNotice}</p>{/if}
    {#each messages as message (message.id)}
      {#if message.role === 'user'}
        <div class="from-you">
          <div class="bubble user" use:sentMotion.bubble={true}>{message.text}</div>
          <span class="sender">You</span>
        </div>
      {:else}
        {@const arrangedCards = anchorEntityCards(message.text, message.inlineCards ?? [], { pending: !!message.pending })}
        {@const readyCards = revealInlineCards(arrangedCards, message.text.length, Boolean(message.pending))}
        {@const blocks = inlineBlocks(message.text, readyCards)}
        {@const groups = groupInlineCards(blocks)}
        {@const hasBlocks = blocks.length > 0}
        {@const isThinking = message.pending && !hasBlocks}
        {#if hasBlocks || message.pending}
          <div class="assistant-turn" class:intro={message.intro}>
            <EnoThinking {variant} active={message.pending} size={40} />
            <div class="assistant-content">
              {#if isThinking}
                <div class="bubble assistant">
                  <div class="thinking-row" role="status" aria-label="Eno is working">
                    <span class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
                  </div>
                </div>
              {/if}
              {#each groups as group, groupIndex}
                {#if group.type === 'inline'}
                  <div class="bubble assistant inline-entities">
                    {#each group.blocks as block, blockIndex (blockIndex)}
                      {#if block.type === 'text'}
                        {#if block.text.trim()}
                          <div class="richtext">{@html renderMarkdown(block.text)}</div>
                        {/if}
                      {:else}
                        {#each block.cards as card (card.id)}
                          <ChatCardView {card} {variant} inline />
                        {/each}
                      {/if}
                    {/each}
                  </div>
                {:else}
                  <ChatCardView
                    card={group.card}
                    {variant}
                    tail={groupIndex === groups.length - 1 && !message.pending}
                  />
                {/if}
              {/each}
              {#if message.pending && hasBlocks}
                <div class="loading-line" role="status" aria-label="Eno is working">
                  <span class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
                </div>
              {/if}
              {#if message.intro && !booting && !ready && status}
                <p class="status-line intro-status">{status}</p>
              {/if}
            </div>
            <span class="sender">
              Eno
              {#if speechSupported && !message.pending && message.text.trim()}
                <ReadAloudButton onclick={() => speak(message.text)} />
              {/if}
            </span>
          </div>
        {/if}
      {/if}
    {/each}

    {#if suggestions.length > 0}
      <div class="chat-followups-row">
        <span class="chat-followups-spacer" aria-hidden="true"></span>
        <div class="chat-followups">
          <FollowUps
            {suggestions}
            disabled={!canSend}
            onSelect={(prompt) => void send(prompt)}
          />
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .chat-panel {
    --chat-bubble-border: 1px solid var(--border);
    --assistant-bubble-radius: var(--bubble-radius) var(--bubble-radius) var(--bubble-radius) 0;
    color: var(--ink);
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .chat-log {
    padding: 30px 22px 36px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }
  .bubble {
    padding: 17px 20px;
    border: var(--chat-bubble-border);
    border-radius: var(--assistant-bubble-radius);
    background: var(--surface);
    overflow-wrap: anywhere;
  }
  .from-you { align-self: flex-end; max-width: 80%; }
  .bubble.user {
    padding-block: 12px;
    border-radius: var(--bubble-radius) var(--bubble-radius) 0 var(--bubble-radius);
    white-space: pre-wrap;
  }
  .bubble.assistant { max-width: 88%; }
  .sender {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 11px;
    margin: 5px 0 0 2px;
  }
  .from-you .sender { justify-content: flex-end; margin-right: 3px; }
  .speech-notice { margin: 0; color: var(--muted); font-size: 11px; text-align: center; }
  /*
   * Single-entity cards render inside the assistant bubble. CardFrame is owned
   * by a child component, so adjust its spacing and background within the bubble.
   */
  .bubble.assistant :global(.entity-card) {
    width: 100%;
    max-width: 100%;
    margin: 6px 0;
    padding: 8px 10px;
    background: color-mix(in srgb, var(--surface) 72%, transparent);
  }
  /*
   * Inner card surfaces are standalone inside the bubble: they never inherit
   * its sharp tail corner, and they use a tighter radius than the 24px bubble
   * with roomier padding. The assistant bubble itself keeps its sharp tail.
   */
  .bubble.assistant.inline-entities :global(.entity-card),
  .bubble.assistant.inline-entities :global(.account-card),
  .bubble.assistant.inline-entities :global(.loan-card),
  .bubble.assistant.inline-entities :global(.transaction-card.inline) {
    border-radius: 8px;
    padding: 12px 14px;
  }
  .assistant-turn {
    align-self: flex-start;
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    column-gap: 12px;
  }
  .assistant-turn > .sender { grid-column: 2; }
  .assistant-turn > :global(.eno-thinking) {
    align-self: flex-end;
    margin-top: 0;
    margin-bottom: 2px;
  }
  .assistant-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .chat-followups-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
    min-width: 0;
  }
  .chat-followups-spacer {
    flex: none;
    width: 40px;
  }
  .chat-followups {
    flex: 1;
    min-width: 0;
    max-width: 88%;
    margin-top: 0;
  }
  .status-line { color: var(--muted); font-size: 14px; }
  .loading-line {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    font-size: 12.5px;
    line-height: 1.35;
  }
  .loading-dots {
    display: inline-flex;
    gap: 4px;
    flex: none;
  }
  .loading-dots i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--muted);
    animation: loading-pulse 1s ease-in-out infinite;
  }
  .loading-dots i:nth-child(2) { animation-delay: 0.15s; }
  .loading-dots i:nth-child(3) { animation-delay: 0.3s; }
  @keyframes loading-pulse {
    50% { opacity: .3; transform: translateY(-2px); }
  }
  @media (max-width: 600px) {
    .chat-log { padding: 18px 16px 28px; gap: 22px; }
    .assistant-turn { column-gap: 8px; }
    .chat-followups-spacer { display: none; }
    .chat-followups { max-width: none; }
    .bubble { padding: 14px; font-size: 14px; }
    .bubble.assistant { max-width: 96%; }
    .from-you { max-width: 85%; }
  }
  @media (prefers-reduced-motion: reduce) {
    .loading-dots i {
      animation: none;
      opacity: 0.75;
    }
  }
  .thinking-row { display: flex; }
  .richtext :global(p) { margin: 0 0 8px; }
  .richtext :global(p:last-child) { margin-bottom: 0; }
  .richtext :global(ul), .richtext :global(ol) {
    margin: 0 0 8px;
    padding-left: 20px;
    display: grid;
    gap: 4px;
  }
  .richtext :global(h3) {
    margin: 4px 0 6px;
    font-size: 14px;
    font-weight: 650;
  }
  .richtext :global(strong) { font-weight: 700; }
  .richtext :global(code) {
    padding: 1px 4px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--border) 55%, transparent);
    font-size: 0.92em;
  }
</style>
