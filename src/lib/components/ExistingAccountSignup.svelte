<script lang="ts">
  import '$lib/assets/message-composer.css';
  import { createConversationPacer } from '$lib/conversationPacing';
  import { readAloud, stopReadAloud, supportsReadAloud } from '$lib/chat/readAloud';
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import CapitalOneLogo from '../../routes/[view=wallet]/CapitalOneLogo.svelte';
  import Eno from './Eno.svelte';
  import { customerHref, rememberCustomerId } from '$lib/customerSelection';
  import { isAffirmative } from '$lib/signupConfirmation';
  import type { AccountProductId, OpeningProduct } from '$lib/accountOpening';

  let { customerId = '' }: { customerId?: string } = $props();
  const pacing = createConversationPacer();
  let profileId = $state('');
  let available = $state<OpeningProduct[]>([]);
  let selected = $state<AccountProductId[]>([]);
  let messages = $state<{ role: 'eno' | 'you'; text: string }[]>([]);
  let loading = $state(true);
  let submitting = $state(false);
  let replying = $state(false);
  let locked = $state(false);
  let failed = $state(false);
  let reply = $state('');
  let theme = $state<'light' | 'dark' | 'system'>('system');
  let systemDark = $state(false);
  let speechSupported = $state(false);
  let notice = $state('');
  let disposed = false;
  let attemptKey = '';
  let isDark = $derived(theme === 'dark' || (theme === 'system' && systemDark));
  let dashboard = $derived(customerHref('/dashboard', profileId));
  let busy = $derived(loading || submitting || replying);

  function speak(text: string) {
    if (!speechSupported) return;
    stopReadAloud();
    notice = '';
    void readAloud(text, (message) => { notice = message; });
  }
  async function addEno(text: string) {
    return await pacing.reply(() => {
      messages.push({ role: 'eno', text });
      void tick().then(() => {
        if (disposed) return;
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reducedMotion ? 'instant' : 'smooth' });
      });
      return true;
    }) ?? false;
  }
  function toggleTheme() {
    theme = isDark ? 'light' : 'dark';
    try { localStorage.setItem('dashboard-theme', theme); } catch { /* Theme still works in this tab. */ }
  }
  async function loadChoices() {
    const response = await fetch(`/api/accounts/open${profileId ? `?customer=${encodeURIComponent(profileId)}` : ''}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'I couldn’t check your accounts right now.');
    profileId = result.customer.id;
    available = result.available;
    selected = selected.filter((id) => available.some((option) => option.id === id));
    attemptKey = crypto.randomUUID();
    return result.customer.firstName as string;
  }
  onMount(() => {
    profileId = customerId;
    const media = matchMedia('(prefers-color-scheme: dark)');
    systemDark = media.matches;
    const change = () => { systemDark = media.matches; };
    media.addEventListener('change', change);
    speechSupported = supportsReadAloud();
    try { const saved = localStorage.getItem('dashboard-theme'); if (saved === 'light' || saved === 'dark' || saved === 'system') theme = saved; } catch { /* Follow the system. */ }
    void (async () => {
      try {
        if (profileId) {
          const response = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customerId: profileId }) });
          if (!response.ok) throw new Error('I couldn’t open that profile. Please choose your name through Sign in.');
        }
        const name = await loadChoices();
        if (disposed) return;
        rememberCustomerId(profileId);
        await addEno(available.length
          ? `Hey, ${name}! What accounts would you like to open?\n\nNo need for another introduction — I’ve got you. Here are the products you don’t have yet. Pick one or a few, and I’ll take care of the setup.`
          : `Hey, ${name}! You already have every product available here — your wallet is fully stocked. You can head back to your dashboard whenever you’re ready.`);
      } catch (error) {
        if (!disposed) { failed = true; await addEno(error instanceof Error ? error.message : 'I couldn’t load your profile. Please try Sign in.'); }
      } finally { if (!disposed) loading = false; }
    })();
    return () => { disposed = true; pacing.dispose(); media.removeEventListener('change', change); stopReadAloud(); };
  });

  function toggle(id: AccountProductId, checked: boolean) {
    selected = checked ? [...selected, id] : selected.filter((item) => item !== id);
  }
  async function openSelected() {
    if (busy || locked || failed) return;
    pacing.userSent();
    if (!selected.length) {
      replying = true;
      try { await addEno('Pick at least one account from the list, then say “yes” or tap Open selected accounts.'); }
      finally { replying = false; }
      return;
    }
    submitting = true;
    const labels = available.filter((option) => selected.includes(option.id)).map((option) => option.label);
    await addEno(`On it — I’m setting up ${labels.join(' and ')} with sample activity. I’ll take you straight back to your dashboard when it’s ready.`);
    if (disposed) return;
    try {
      const response = await fetch('/api/accounts/open', {
        method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': attemptKey },
        body: JSON.stringify({ customerId: profileId, products: selected })
      });
      const result = await response.json();
      if (disposed) return;
      if (!response.ok) {
        if (response.status === 409) {
          // Refresh may itself reject if another tab switched profiles. Never write to that profile.
          await loadChoices();
          await addEno(result.error || 'Your account list changed. Check the refreshed choices before continuing.');
        } else if (response.status === 400) await addEno(result.error || 'Please check your selection.');
        else if (response.status === 401 || response.status === 403 || response.status === 404) { failed = true; await addEno(result.error || 'Please choose your profile again through Sign in.'); }
        else { locked = true; await addEno('I couldn’t confirm the account request. Let’s check your dashboard before trying again.'); }
        return;
      }
      locked = true;
      if (result.accountError) { await addEno(result.accountError); return; }
      rememberCustomerId(profileId);
      await goto(dashboard);
    } catch {
      locked = true;
      await addEno('I couldn’t confirm the account request. Let’s check your dashboard before trying again.');
    } finally { submitting = false; }
  }
  async function send(event: SubmitEvent) {
    event.preventDefault();
    const text = reply.trim();
    if (!text || busy || locked || failed) return;
    reply = '';
    pacing.userSent();
    stopReadAloud();
    messages.push({ role: 'you', text });
    if (isAffirmative(text)) { await openSelected(); return; }
    replying = true;
    try {
      if (/\b(no|cancel|never mind|nevermind)\b/i.test(text)) { await addEno('No rush! You can change your picks above or head back to your dashboard.'); return; }
      const mentioned = available.filter((option) => text.toLowerCase().includes(option.id) || (option.id === 'savings' && /\bsaving\b/i.test(text)));
      if (text.includes('?') || /\b(what|explain|tell|how|difference)\b/i.test(text)) {
        const options = mentioned.length ? mentioned : available;
        await addEno(options.map((option) => `${option.label}: ${option.description.toLowerCase()}.`).join('\n\n') + '\n\nThese are demo accounts. Each new account gets 100 sample transactions, with a balance and points based on that history. You can only have one checking, one savings, and one of each credit card.');
      } else if (mentioned.length) {
        selected = mentioned.map((option) => option.id);
        await addEno(`I’ve selected ${mentioned.map((option) => option.label).join(' and ')}. Adjust the list if you like, then say “yes” and I’ll open your picks.`);
      } else await addEno('Use the account list to pick what you’d like, or ask me about checking, savings, or a card. When your picks look good, say “yes” and I’ll get them ready.');
    } finally { replying = false; }
  }
</script>

{#snippet speaker()}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4V5Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></svg>{/snippet}
<div class="existing-signup setup-composer-background" data-theme={theme}>
  <header>
    <a class="brand" href="/" aria-label="Capital One home"><CapitalOneLogo label="Capital One" /></a>
    <div class="actions">
      <button class="icon" aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} onclick={toggleTheme}>{isDark ? '☀' : '☾'}</button>
      <a class="icon" href={dashboard} aria-label="Back to dashboard">×</a>
    </div>
  </header>
  <main>
    <h1 class="sr-only">Open accounts with Eno</h1>
    <div class="transcript" role="log" aria-label="Your conversation with Eno" aria-live="polite">
      <div class="messages">
        {#if notice}<p role="status">{notice}</p>{/if}
        {#if loading}<p role="status">Checking your available accounts…</p>{/if}
        {#each messages as message, index}
          <div class="message" class:from-you={message.role === 'you'}>
            {#if message.role === 'eno'}<span class="avatar"><Eno variant={isDark ? 'dark' : 'light'} size={40} alt="Eno" /></span>{/if}
            <div class="bubble"><p>{message.text}</p>
              {#if index === 0 && !failed && available.length}
                <details open>
                  <summary>Choose accounts <span>{selected.length} selected</span></summary>
                  <fieldset disabled={busy || locked} aria-label="Available accounts">
                    <legend class="sr-only">Accounts you don’t already have</legend>
                    {#each available as option (option.id)}
                      <label style:background={option.gradient} style:color={option.ink}>
                        <input type="checkbox" checked={selected.includes(option.id)} onchange={(event) => toggle(option.id, event.currentTarget.checked)} />
                        <span>{option.label}<small>{option.description}</small></span>
                      </label>
                    {/each}
                  </fieldset>
                </details>
                <p class="hint">Only products you don’t already have are shown. Each new account includes 100 sample transactions, bills, and a loan.</p>
                <button class="setup-action" disabled={busy || locked || !selected.length} onclick={openSelected}>Open selected accounts <span aria-hidden="true">→</span></button>
              {/if}
            </div>
            <span class="sender">{message.role === 'eno' ? 'Eno' : 'You'}{#if message.role === 'eno' && speechSupported}<button class="read" aria-label="Read Eno message aloud" onclick={() => speak(message.text)}>{@render speaker()}</button>{/if}</span>
          </div>
        {/each}
        {#if submitting}<p class="progress" role="status">Setting up your accounts and sample activity…</p>{/if}
        {#if replying}<p class="progress" role="status">Eno is typing…</p>{/if}
        {#if !loading && (locked || failed || !available.length)}
          <a class="setup-action" href={failed ? '/' : dashboard}>{failed ? 'Go to Sign in' : 'Open my dashboard'} <span aria-hidden="true">→</span></a>
        {/if}
      </div>
    </div>
    <div class="composer-area">
      <form class="message-composer" onsubmit={send}>
        <input bind:value={reply} aria-label="Message Eno" placeholder="Message Eno…" disabled={busy || locked || failed || !available.length} maxlength="2000" autocomplete="off" />
        <button type="submit" class="message-send" aria-label="Send message" disabled={busy || locked || failed || !available.length || !reply.trim()}>↑</button>
      </form>
    </div>
  </main>
</div>

<style>
  :global(body:has(.existing-signup)) { margin: 0; }
  .existing-signup { --dark: ; --light: initial; --page: var(--dark, #171717) var(--light, #f4f6f8); --surface: var(--dark, #242424) var(--light, #fff); --ink: var(--dark, #f2f2f2) var(--light, #142632); --muted: var(--dark, #bdbdbd) var(--light, #50636e); --border: var(--dark, #414141) var(--light, #dae3e8); min-height: 100dvh; display: flex; flex-direction: column; color: var(--ink); color-scheme: var(--dark, dark) var(--light, light); font: 15px/1.65 var(--font-sans); }
  .existing-signup[data-theme='dark'] { --dark: initial; --light: ; }
  @media (prefers-color-scheme: dark) { .existing-signup[data-theme='system'] { --dark: initial; --light: ; } }
  .existing-signup * { box-sizing: border-box; }
  button, input { font: inherit; color: inherit; } button { cursor: pointer; } button:disabled { opacity: .5; cursor: default; } a { color: inherit; text-decoration: none; }
  :is(button, a, summary):focus-visible { outline: 2px solid var(--link); outline-offset: 4px; }
  header { width: min(1200px, calc(100% - 72px)); margin: 0 auto; padding: 24px 0; display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; color: var(--dark, #fff) var(--light, #013d5b); } .brand :global(svg) { width: 110px; height: 40px; }
  .actions { display: flex; align-items: center; gap: 16px; } .icon { border: 1px solid var(--border); background: transparent; border-radius: 24px; }
  .icon { width: 38px; height: 38px; display: grid; place-items: center; font-size: 22px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .messages { display: flex; flex-direction: column; gap: 28px; padding: 30px 22px 36px; } .message { display: grid; align-self: flex-start; grid-template-columns: 40px minmax(0, 1fr); column-gap: 12px; max-width: 94%; } .avatar { display: block; align-self: end; width: 40px; height: 40px; }
  .sender { grid-column: -2 / -1; display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 11px; margin: 5px 0 0 2px; } .read { display: grid; place-items: center; padding: 1px; background: transparent; border: 0; } .read svg { width: 13px; height: 13px; }
  .bubble { padding: 17px 20px; border: 1px solid var(--border); border-radius: var(--bubble-radius) var(--bubble-radius) var(--bubble-radius) 0; background: var(--surface); } .bubble > p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .from-you { grid-template-columns: minmax(0, 1fr); align-self: flex-end; max-width: 80%; } .from-you .sender { justify-content: flex-end; } .from-you .bubble { border-radius: var(--bubble-radius) var(--bubble-radius) 0 var(--bubble-radius); }
  details { margin-top: 20px; border-top: 1px solid var(--border); } summary { display: list-item; padding: 12px 0; cursor: pointer; font-size: 13px; font-weight: 600; } summary > span { float: right; margin-left: 20px; font-weight: 400; color: var(--muted); }
  fieldset { min-width: 0; margin: 0; padding: 0; border: 0; display: grid; gap: 8px; } label { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid transparent; border-radius: 10px; cursor: pointer; } label:has(input:checked) { outline: 2px solid var(--link); outline-offset: 1px; } label > span { font-size: 13px; font-weight: 600; line-height: 1.5; } small { display: block; margin-top: 2px; font-size: 11px; font-weight: 400; } input[type='checkbox'] { width: 18px; height: 18px; margin: 0; flex: none; } fieldset:disabled label { opacity: .6; cursor: default; }
  .bubble > .hint { margin: 12px 0; color: var(--muted); font-size: 11px; } .progress { margin: 0 0 0 52px; font-size: 12px; color: var(--muted); }
  @media (max-width: 600px) { header { width: calc(100% - 36px); padding: 18px 0; } .brand :global(svg) { width: 94px; height: 34px; } .actions { gap: 10px; } .messages { padding: 18px 16px 28px; gap: 22px; } .message { max-width: 100%; column-gap: 8px; } .bubble { padding: 14px; font-size: 14px; } label { padding: 12px; } }
</style>
