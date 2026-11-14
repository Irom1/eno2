<script lang="ts">
  import { tick } from 'svelte';
  import { renderMarkdown } from '$lib/markdown.js';
  import { createSseParser } from '$lib/sse.js';
  import { chatCardKind, type ChatCard } from '$lib/chat/cards.js';
  import {
    anchorTransactionCards,
    anomalyExplanation,
    anomalyTransactionCards,
    mergeEntityCards,
    mergeTransactionListCards,
    spendingPieCard,
    transactionListCard,
    type EntityCard,
    type SpendingPieEntityCard,
    type TransactionListEntityCard
  } from '$lib/chat/entityCards.js';
  import { inlineBlocks, revealInlineCards } from '$lib/chat/inline.js';
  import { followUpsFor } from '$lib/chat/followUps.js';
  import { STARTER_PROMPTS } from '$lib/chat/starters.js';
  import { GUEST_CUSTOMER_ID } from '$lib/chat/guest';
  import {
    friendlyToolLabel,
    initialThinking,
    pushThinkingStep,
    THINKING_COMPOSING,
    type ThinkingState
  } from '$lib/chat/thinking.js';
  import { visibleCards } from '$lib/chat/relevance.js';
  import type { EnoVariant } from '$lib/eno.js';
  import EnoThinking from '$lib/components/EnoThinking.svelte';
  import FollowUps from './FollowUps.svelte';
  import TransactionCard from './inline-cards/TransactionCard.svelte';
  import TransactionListCard from './inline-cards/TransactionListCard.svelte';
  import PieChartCard from './inline-cards/PieChartCard.svelte';

  interface Props {
    open: boolean;
    customerId: string;
    initialPrompt: { text: string; id: number } | null;
    onClose: () => void;
    canSend: boolean;
    variant?: EnoVariant;
  }

  interface ChatMessage {
    id: number;
    role: 'user' | 'assistant';
    text: string;
    prompt?: string;
    pending?: boolean;
    cards?: ChatCard[];
    inlineCards?: EntityCard[];
    intro?: boolean;
  }

  let {
    open,
    customerId,
    initialPrompt,
    onClose,
    canSend = $bindable(),
    variant = 'light'
  }: Props = $props();

  let ready = $state(false);
  let booting = $state(false);
  let bootPromise: Promise<boolean> | null = null;
  let bootTarget = '';
  let sessionCustomerId = $state('');

  const INTRO =
    "Hi there — I'm Eno 2.0. I can help with spending, bills, balances, loans, and rewards. Ask me anything, or pick a question to get started.";

  let messageSeq = 0;

  function introMessage(): ChatMessage {
    const text = customerId === GUEST_CUSTOMER_ID
      ? "Hi, I'm Eno 2.0. I can help you explore how to open an account."
      : INTRO;
    return { id: ++messageSeq, role: 'assistant', text, intro: true, pending: false };
  }

  let messages = $state<ChatMessage[]>([introMessage()]);
  let streaming = $state(false);
  let status = $state('');
  let thinking = $state<ThinkingState>(initialThinking());
  let requestSeq = 0;
  let cardSeq = 0;
  let lastPromptId = 0;
  let inFlightPromptId = 0;
  let logEl: HTMLDivElement;

  const suggestions = $derived.by(() => {
    if (streaming || customerId === GUEST_CUSTOMER_ID) return [];
    const hasUserMessage = messages.some((message) => message.role === 'user');
    if (!hasUserMessage) return [...STARTER_PROMPTS];
    const last = [...messages].reverse().find((message) => message.role === 'assistant');
    if (!last || last.pending) return [];
    const shown = visibleCards(last.cards ?? [], last.prompt ?? '');
    if (!last.text && shown.length === 0) return [];
    return followUpsFor(shown, last.prompt ?? '').slice(0, 3);
  });

  function scrollLog(): void {
    void tick().then(() => {
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    });
  }

  async function openSession(id: string): Promise<boolean> {
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerId: id })
      });
      if (!response.ok) throw new Error('Could not start a session.');
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
    if (!id) {
      status = 'Choose an account to get started.';
      return false;
    }
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

  /** Fill empty assistant prose with a deterministic explanation for its cards. */
  function ensureExplanation(message: ChatMessage): void {
    const cards = message.inlineCards ?? [];
    if (message.text.trim() || cards.length === 0) return;
    if (cards.some((card) => card.kind === 'transaction-list')) {
      message.text = 'Here are your recent transactions, with the most recent first.';
      return;
    }
    message.text = anomalyExplanation(cards);
  }

  function markError(id: number): void {
    const message = findMessage(id);
    if (!message) return;
    const notice = 'Something went wrong. Please try again.';
    message.text = message.text ? `${message.text}\n\n${notice}` : notice;
    message.pending = false;
  }

  async function send(text: string): Promise<boolean> {
    const value = text.trim();
    if (!value || !ready || streaming) return false;

    const requestId = ++requestSeq;
    const userId = ++messageSeq;
    const assistantId = ++messageSeq;
    messages.push({ id: userId, role: 'user', text: value });
    messages.push({ id: assistantId, role: 'assistant', text: '', prompt: value, pending: true });
    streaming = true;
    thinking = initialThinking();
    status = '';
    scrollLog();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: value })
      });
      if (!response.ok || !response.body) {
        markError(assistantId);
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
              scrollLog();
            }
            break;
          case 'tool_start': {
            const name = typeof data.name === 'string' ? data.name : '';
            const label = typeof data.label === 'string' ? data.label : '';
            thinking = pushThinkingStep(thinking, friendlyToolLabel(name, label));
            break;
          }
          case 'insight': {
            if (typeof data.kind !== 'string') break;
            // Cards are about to render; the model still owes us prose. Surface
            // that phase so the wait between the card and the answer is legible.
            if (message.pending && !message.text.trim()) {
              thinking = pushThinkingStep(thinking, THINKING_COMPOSING);
            }
            const payload = data.payload;
            const accountId = typeof data.accountId === 'string' ? data.accountId : '';
            const fingerprint = `${data.kind}:${JSON.stringify(payload)}`;
            const existing = message.cards ?? [];
            if (
              existing.some(
                (card) => `${card.tool}:${JSON.stringify(card.payload)}` === fingerprint
              )
            ) {
              break;
            }
            if (!message.cards) message.cards = [];
            message.cards.push({
              id: ++cardSeq,
              kind: chatCardKind(data.kind),
              tool: data.kind,
              payload,
              afterText:
                message.text.trim().length > 0 ? message.text.length : Number.MAX_SAFE_INTEGER
            });
            if (data.kind === 'insight_anomalies') {
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
            if (data.kind === 'insight_spending_breakdown') {
              // One primitive pie card per turn: a later spending insight in the
              // same turn replaces the earlier one rather than stacking charts.
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
            if (chatCardKind(data.kind) === 'transactions') {
              // Deposits and withdrawals in one turn share a single merged list.
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
            scrollLog();
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
      scrollLog();
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
    canSend = ready && !streaming;
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
  <div class="chat-log" aria-live="polite" aria-label="Conversation" bind:this={logEl}>
    {#each messages as message (message.id)}
      {#if message.role === 'user'}
        <div class="bubble user">{message.text}</div>
      {:else}
        {@const arrangedCards = anchorTransactionCards(message.text, message.inlineCards ?? [])}
        {@const readyCards = revealInlineCards(arrangedCards, message.text.length, Boolean(message.pending))}
        {@const blocks = inlineBlocks(message.text, readyCards)}
        {@const hasBlocks = blocks.length > 0}
        {@const isThinking = message.pending && !hasBlocks}
        {@const inlineTransactionTurn =
          hasBlocks &&
          blocks.some(
            (block) =>
              block.type === 'cards' && block.cards.some((card) => card.kind === 'transaction')
          ) &&
          !blocks.some(
            (block) =>
              block.type === 'cards' &&
              block.cards.some((card) => card.kind !== 'transaction')
          )}
        {#if hasBlocks || message.pending}
          <div class="assistant-turn" class:intro={message.intro}>
            <EnoThinking {variant} active={message.pending} size={40} />
            <div class="assistant-content">
              {#if isThinking}
                <div class="bubble assistant">
                  <div class="thinking-row">
                    <ol class="thinking-steps" aria-label="Eno is working">
                      {#each thinking.steps as step, index (step + index)}
                        <li class="step done">
                          <svg class="step-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m5 12 5 5 9-10" stroke-linecap="round" stroke-linejoin="round"/></svg>
                          <span>{step}</span>
                        </li>
                      {/each}
                      <li class="step current status-line">
                        <span class="step-dot" aria-hidden="true"></span>
                        <span>{thinking.current || 'Looking that up'}</span>
                      </li>
                    </ol>
                  </div>
                </div>
              {/if}
              {#if inlineTransactionTurn}
                <div class="bubble assistant inline-transactions">
                  {#each blocks as block, index (block.type + index)}
                    {#if block.type === 'text'}
                      {#if block.text.trim()}
                        <div class="richtext">{@html renderMarkdown(block.text)}</div>
                      {/if}
                    {:else}
                      {#each block.cards as card (card.id)}
                        {#if card.kind === 'transaction'}
                          <TransactionCard {card} inline />
                        {/if}
                      {/each}
                    {/if}
                  {/each}
                  {#if message.pending}
                    <div class="loading-line status-line">
                      <span class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
                      <span>{thinking.current || 'Still working…'}</span>
                    </div>
                  {/if}
                </div>
              {:else}
                {#each blocks as block, index (block.type + index)}
                  {#if block.type === 'text'}
                    {#if block.text.trim()}
                      <div class="bubble assistant">
                        <div class="richtext">{@html renderMarkdown(block.text)}</div>
                      </div>
                    {/if}
                  {:else}
                    {#each block.cards as card (card.id)}
                      {#if card.kind === 'transaction'}
                        <TransactionCard {card} />
                      {:else if card.kind === 'transaction-list'}
                        <TransactionListCard {card} />
                      {:else if card.kind === 'spending-pie'}
                        <PieChartCard {card} />
                      {/if}
                    {/each}
                  {/if}
                {/each}
                {#if message.pending && hasBlocks}
                  <div class="loading-line status-line">
                    <span class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
                    <span>{thinking.current || 'Still working…'}</span>
                  </div>
                {/if}
              {/if}
              {#if message.intro && (booting || !ready)}
                <p class="status-line intro-status">{status || 'Connecting…'}</p>
              {/if}
            </div>
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
    height: 100%;
    min-height: 0;
    color: var(--ink);
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .chat-log {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .bubble {
    max-width: 88%;
    padding: 10px 14px;
    overflow-wrap: anywhere;
  }
  .bubble.user {
    align-self: flex-end;
    max-width: 85%;
    background: var(--button);
    color: var(--button-text);
    border-radius: 18px 18px 4px 18px;
    white-space: pre-wrap;
  }
  .bubble.assistant {
    align-self: flex-start;
    background: var(--page);
    border: 1px solid var(--border);
    border-radius: 18px 18px 18px 4px;
  }
  .assistant-turn {
    align-self: flex-start;
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
  }
  .assistant-turn > :global(.eno-thinking) { margin-top: 2px; }
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
    gap: 10px;
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
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--link);
    animation: loading-pulse 1s ease-in-out infinite;
  }
  .loading-dots i:nth-child(2) { animation-delay: 0.15s; }
  .loading-dots i:nth-child(3) { animation-delay: 0.3s; }
  @keyframes loading-pulse {
    0%,
    100% {
      opacity: 0.3;
      transform: scale(0.8);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .loading-dots i {
      animation: none;
      opacity: 0.75;
    }
  }
  .thinking-row { display: flex; align-items: flex-start; gap: 10px; }
  .thinking-steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .step {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    line-height: 1.35;
    color: var(--muted);
  }
  .step.current { color: var(--ink); font-weight: 600; }
  .step-check { width: 13px; height: 13px; flex: none; color: var(--link); }
  .step-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--link);
    flex: none;
    animation: step-pulse 1.1s ease-in-out infinite;
  }
  @keyframes step-pulse {
    0%,
    100% {
      opacity: 0.35;
      transform: scale(0.85);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .step-dot { animation: none; }
  }
  .richtext { line-height: 1.5; }
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
