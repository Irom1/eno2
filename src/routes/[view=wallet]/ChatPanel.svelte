<script lang="ts">
  import { tick } from 'svelte';
  import { renderMarkdown } from '$lib/markdown.js';
  import { createSseParser } from '$lib/sse.js';
  import { chatCardKind, type ChatCard } from '$lib/chat/cards.js';
  import { filterCardDuplication } from '$lib/chat/dedupe.js';
  import { followUpsFor } from '$lib/chat/followUps.js';
  import { allowedKindsFor, classifyIntents, isCreditOnlyPrompt, visibleCards } from '$lib/chat/relevance.js';
  import type { EnoVariant } from '$lib/eno.js';
  import EnoThinking from '$lib/components/EnoThinking.svelte';
  import ChatCardRenderer from './chat-cards/ChatCardRenderer.svelte';
  import FollowUps from './FollowUps.svelte';

  interface Props {
    open: boolean;
    customerId: string;
    initialPrompt: { text: string; id: number } | null;
    onClose: () => void;
    canSend: boolean;
    hasMessages: boolean;
    variant?: EnoVariant;
  }

  interface ChatMessage {
    id: number;
    role: 'user' | 'assistant';
    text: string;
    prompt?: string;
    pending?: boolean;
    cards?: ChatCard[];
  }

  let {
    open,
    customerId,
    initialPrompt,
    onClose,
    canSend = $bindable(),
    hasMessages = $bindable(),
    variant = 'light'
  }: Props = $props();

  let ready = $state(false);
  let booting = $state(false);
  let bootPromise: Promise<boolean> | null = null;
  let bootTarget = '';
  let sessionCustomerId = $state('');
  let messages = $state<ChatMessage[]>([]);
  let streaming = $state(false);
  let status = $state('');
  let messageSeq = 0;
  let requestSeq = 0;
  let cardSeq = 0;
  let lastPromptId = 0;
  let inFlightPromptId = 0;
  let logEl: HTMLDivElement;

  const lastAssistantId = $derived(
    [...messages].reverse().find((message) => message.role === 'assistant')?.id
  );

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
      messages = [];
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

  function statusFor(name: string): string {
    if (name.includes('bill')) return "Checking what's due…";
    if (name.includes('spend')) return 'Looking at your spending…';
    if (name.includes('anomal')) return 'Scanning for anything unusual…';
    if (name.includes('atm') || name.includes('branch')) return 'Finding nearby locations…';
    if (name.includes('overview')) return 'Reviewing your accounts…';
    return 'Looking that up…';
  }

  function findMessage(id: number): ChatMessage | undefined {
    return messages.find((message) => message.id === id);
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
    status = 'Thinking…';
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
          case 'tool_start':
            status = statusFor(typeof data.name === 'string' ? data.name : '');
            break;
          case 'insight': {
            if (typeof data.kind !== 'string') break;
            const payload = data.payload;
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
              payload
            });
            scrollLog();
            break;
          }
          case 'error':
            markError(assistantId);
            break;
          case 'done':
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
      if (message) message.pending = false;
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
    hasMessages = messages.length > 0;
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
  inert={!open}
>
  <header class="chat-header">
    <div class="chat-heading">
      <EnoThinking {variant} size={34} />
      <h2>Eno 2.0</h2>
    </div>
  </header>

  <div class="chat-log" aria-live="polite" aria-label="Conversation" bind:this={logEl}>
    {#if messages.length === 0}
      <div class="empty-state">
        <EnoThinking {variant} size={104} />
        <p class="empty-title">Hi — I can look at your spending, bills, and accounts.</p>
        {#if booting || !ready}
          <p class="status-line">{status || 'Connecting…'}</p>
        {/if}
      </div>
    {/if}

    {#each messages as message (message.id)}
      {#if message.role === 'user'}
        <div class="bubble user">{message.text}</div>
      {:else}
        {@const allowedKinds = allowedKindsFor(classifyIntents(message.prompt ?? ''))}
        {@const creditOnly = isCreditOnlyPrompt(message.prompt ?? '')}
        {@const shownCards = visibleCards(message.cards ?? [], message.prompt ?? '')}
        {@const hasCards = shownCards.length > 0}
        {@const displayText =
          hasCards && message.pending ? '' : filterCardDuplication(message.text, shownCards)}
        {@const showText = displayText.length > 0}
        {#if showText || message.pending || hasCards}
          <div class="assistant-turn">
            {#if showText || message.pending}
              <div class="bubble assistant">
                {#if message.pending && !showText}
                  <div class="thinking-row">
                    <EnoThinking {variant} active size={40} />
                    <p class="status-line">{status || 'Looking that up…'}</p>
                  </div>
                {/if}
                {#if showText}
                  <div class="richtext">{@html renderMarkdown(displayText)}</div>
                {/if}
              </div>
            {/if}
            {#if hasCards}
              <div class="chat-cards">
                {#each shownCards as card (card.id)}
                  <ChatCardRenderer
                    {card}
                    allowedKinds={allowedKinds.size > 0 ? allowedKinds : undefined}
                    accountFilter={creditOnly ? 'credit' : 'all'}
                  />
                {/each}
              </div>
            {/if}
            {#if message.id === lastAssistantId && !message.pending && !streaming && (message.text || hasCards)}
              <FollowUps
                suggestions={followUpsFor(shownCards, message.prompt ?? '')}
                disabled={!canSend}
                onSelect={(prompt) => void send(prompt)}
              />
            {/if}
          </div>
        {/if}
      {/if}
    {/each}
  </div>


</div>

<style>
  .chat-panel {
    height: 100%;
    color: var(--ink);
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--border);
  }
  .chat-heading { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .chat-heading h2 {
    margin: 0;
    font-size: 15px;
    line-height: 1.3;
    font-weight: 650;
    letter-spacing: -0.015em;
  }
  .chat-log {
    flex: 1;
    overflow-y: auto;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .empty-state { display: grid; justify-items: start; gap: 14px; margin: auto 0 0; }
  .empty-title { font-weight: 600; line-height: 1.4; }
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
    flex-direction: column;
  }
  .chat-cards {
    display: grid;
    gap: 10px;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    margin-top: 8px;
  }
  .status-line { color: var(--muted); font-size: 14px; }
  .thinking-row { display: flex; align-items: center; gap: 10px; }
  .thinking-row .status-line { margin: 0; }
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
