<script lang="ts">
  import { tick } from 'svelte';
  import { renderMarkdown } from '$lib/markdown.js';
  import { createSseParser } from '$lib/sse.js';

  interface Props {
    open: boolean;
    initialPrompt: { text: string; id: number } | null;
    onClose: () => void;
    canSend: boolean;
    hasMessages: boolean;
  }

  interface Customer {
    id: string;
    firstName: string;
    lastName: string;
  }

  interface ChatMessage {
    id: number;
    role: 'user' | 'assistant';
    text: string;
    pending?: boolean;
  }

  let { open, initialPrompt, onClose, canSend = $bindable(), hasMessages = $bindable() }: Props = $props();

  let customers = $state<Customer[]>([]);
  let customerId = $state('');
  let ready = $state(false);
  let booting = $state(false);
  let bootPromise: Promise<boolean> | null = null;
  let messages = $state<ChatMessage[]>([]);
  let streaming = $state(false);
  let status = $state('');
  let messageSeq = 0;
  let requestSeq = 0;
  let lastPromptId = 0;
  let logEl: HTMLDivElement;

  const displayName = (customer: Customer): string =>
    `${customer.firstName} ${customer.lastName}`.trim() || 'Customer';

  function scrollLog(): void {
    void tick().then(() => {
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    });
  }

  async function createSession(id: string): Promise<void> {
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customerId: id })
    });
    if (!response.ok) throw new Error('Could not start a session.');
    customerId = id;
    ready = true;
  }

  async function boot(): Promise<boolean> {
    if (ready) return true;
    if (bootPromise) return bootPromise;

    booting = true;
    bootPromise = (async () => {
      try {
        const response = await fetch('/api/customers');
        if (!response.ok) throw new Error('Could not load customers.');
        const payload = (await response.json()) as { customers?: Customer[] };
        const list = Array.isArray(payload.customers) ? payload.customers : [];
        if (list.length === 0) throw new Error('No customers available.');
        customers = list;
        const preferred = list.find((customer) => customer.lastName === 'Chen') ?? list[0];
        if (!preferred) throw new Error('No customers available.');
        await createSession(preferred.id);
        return true;
      } catch {
        status = 'Unable to connect right now.';
        return false;
      } finally {
        booting = false;
        bootPromise = null;
      }
    })();

    return bootPromise;
  }

  async function switchCustomer(id: string): Promise<void> {
    if (!id || id === customerId) return;
    requestSeq += 1;
    streaming = false;
    status = '';
    messages = [];
    ready = false;
    try {
      await fetch('/api/session', { method: 'DELETE' });
    } catch {
      // The new session below is the source of truth.
    }
    try {
      await createSession(id);
    } catch {
      status = 'Unable to switch customers right now.';
    }
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

  async function send(text: string): Promise<void> {
    const value = text.trim();
    if (!value || !ready || streaming) return;

    const requestId = ++requestSeq;
    const userId = ++messageSeq;
    const assistantId = ++messageSeq;
    messages.push({ id: userId, role: 'user', text: value });
    messages.push({ id: assistantId, role: 'assistant', text: '', pending: true });
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
        return;
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
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (open && event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      onClose();
    }
  }

  $effect(() => {
    if (open) void boot();
  });

  $effect(() => {
    canSend = ready && !streaming;
    hasMessages = messages.length > 0;
  });

  $effect(() => {
    const prompt = initialPrompt;
    if (!prompt || prompt.id === lastPromptId) return;
    lastPromptId = prompt.id;
    void (async () => {
      const ok = await boot();
      if (ok) await send(prompt.text);
    })();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="chat-panel"
  role="region"
  aria-label="Capital One Assistant"
  inert={!open}
>
  <header class="chat-header">
    <div class="chat-heading">
      <h2>Capital One Assistant</h2>
      <label class="customer-picker">
        <span class="sr-only">Customer</span>
        <select
          value={customerId}
          disabled={!ready || booting}
          onchange={(event) => void switchCustomer(event.currentTarget.value)}
        >
          {#each customers as customer (customer.id)}
            <option value={customer.id}>{displayName(customer)}</option>
          {/each}
        </select>
      </label>
    </div>
  </header>

  <div class="chat-log" aria-live="polite" aria-label="Conversation" bind:this={logEl}>
    {#if messages.length === 0}
      <div class="empty-state">
        <p class="empty-title">Hi — I can look at your spending, bills, and accounts.</p>
        {#if booting || !ready}
          <p class="status-line">{status || 'Connecting…'}</p>
        {/if}
      </div>
    {/if}

    {#each messages as message (message.id)}
      {#if message.role === 'user'}
        <div class="bubble user">{message.text}</div>
      {:else if message.text || message.pending}
        <div class="bubble assistant">
          {#if message.pending && !message.text}
            <p class="status-line">{status || 'Looking that up…'}</p>
          {/if}
          {#if message.text}
            <div class="richtext">{@html renderMarkdown(message.text)}</div>
          {/if}
        </div>
      {/if}
    {/each}
  </div>


</div>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
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
  .chat-heading { display: grid; gap: 7px; min-width: 0; }
  .chat-heading h2 {
    margin: 0;
    font-size: 15px;
    line-height: 1.3;
    font-weight: 650;
    letter-spacing: -0.015em;
  }
  .customer-picker { display: block; }
  .customer-picker select {
    max-width: 100%;
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 5px 8px;
    background: var(--page);
    color: var(--ink);
    font-size: 13px;
  }
  .chat-log {
    flex: 1;
    overflow-y: auto;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .empty-state { display: grid; gap: 14px; margin: auto 0 0; }
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
  .status-line { color: var(--muted); font-size: 14px; }
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
