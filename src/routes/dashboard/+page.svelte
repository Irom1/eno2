<script lang="ts">
  import { onMount, tick } from 'svelte';
  import CapitalOneLogo from './CapitalOneLogo.svelte';
  import ChatPanel from './ChatPanel.svelte';

  type Theme = 'light' | 'dark' | 'system';

  const accounts = [
    { name: '360 Checking', ending: '3324', balance: '10.03', kind: 'Available balance', tint: 'aqua', action: 'View account', card: 'View debit card' },
    { name: 'Quicksilver', ending: '5421', balance: '473.98', kind: 'Current balance', tint: 'slate', action: 'Make a payment', scheduled: '$473.95 in scheduled payments', card: 'Get virtual card' },
    { name: 'Discover it', ending: '0734', balance: '656.81', kind: 'Current balance', tint: 'peach', action: 'Make a payment', scheduled: '$259.00 in scheduled payments', card: 'Get virtual card' },
    { name: 'Savor', ending: '1423', balance: '0.00', kind: 'Current balance', tint: 'rose', action: 'View account', card: 'Get virtual card' }
  ];

  const signIn = 'https://www.capitalone.com/sign-in/';
  const helpCenter = 'https://www.capitalone.com/help-center/';

  let theme = $state<Theme>('system');
  let profileOpen = $state(false);
  let chatOpen = $state(false);
  let chatPrompt = $state<{ text: string; id: number } | null>(null);
  let promptSeq = 0;
  let profileButton: HTMLButtonElement;
  let closeProfileButton: HTMLButtonElement;

  async function toggleProfile() {
    if (!profileOpen) chatOpen = false;
    profileOpen = !profileOpen;
    await tick();
    (profileOpen ? closeProfileButton : profileButton).focus();
  }

  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && !chatOpen && profileOpen && !event.defaultPrevented && !dialog?.open) {
      void toggleProfile();
    }
  }
  let hidden = $state<Record<string, boolean>>({});
  const shortcuts = [
    { label: 'Snapshot', prompt: 'Give me a snapshot of my finances', icon: 'card' },
    { label: 'Spending', prompt: 'Where did my money go last month?', icon: 'gift' },
    { label: 'Bills', prompt: "What's due in the next 30 days?", icon: 'tag' },
    { label: 'ATM finder', prompt: 'Find an ATM near Arlington', icon: 'pin' }
  ];

  let query = $state('');

  function openChat(text?: string) {
    chatOpen = true;
    profileOpen = false;
    const trimmed = text?.trim();
    if (trimmed) chatPrompt = { text: trimmed, id: ++promptSeq };
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    query = '';
    openChat(text);
  }
  let dialog: HTMLDialogElement;
  let selected = $state<{ title: string; detail: string; link?: string; linkText?: string }>();

  onMount(() => {
    try {
      const saved = localStorage.getItem('dashboard-theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') theme = saved;
    } catch {
      // The system preference still works when browser storage is unavailable.
    }
  });

  function changeTheme(event: Event & { currentTarget: HTMLSelectElement }) {
    theme = event.currentTarget.value as Theme;
    try {
      localStorage.setItem('dashboard-theme', theme);
    } catch {
      // Keep the selected theme for the current visit.
    }
  }

  function show(title: string, detail: string, link?: string, linkText = 'Continue to Capital One') {
    selected = { title, detail, link, linkText };
    dialog.showModal();
  }

  function openAccount(account: (typeof accounts)[number], action: string) {
    const balance = hidden[account.ending] ? '' : ` ${account.kind}: $${account.balance}.`;
    const scheduled = account.scheduled ? ` ${account.scheduled}.` : '';
    show(`${action} · ${account.name} ••${account.ending}`, `Sign in to manage this account.${balance}${scheduled}`, signIn);
  }
</script>

<svelte:head>
  <title>Account overview | Capital One</title>
  <meta name="description" content="Your Capital One accounts, rewards, and credit tools." />
</svelte:head>

{#snippet cardIcon()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18m-14 5h4"/></svg>
{/snippet}

{#snippet arrowIcon()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 18 18 6M8 6h10v10"/></svg>
{/snippet}

<svelte:window onkeydown={handleEscape} />

<div class="dashboard" class:profile-open={profileOpen} class:chat-open={chatOpen} data-theme={theme}>
  <div class="dashboard-body" inert={profileOpen || chatOpen}>
    <div class="wallet-band">
      <header class="header">
        <div class="container header-inner">
          <a class="brand" href="/dashboard"><CapitalOneLogo label="Capital One dashboard" /></a>
          <button class="profile" bind:this={profileButton} aria-label="Mori profile" aria-expanded={profileOpen} aria-controls="profile-panel" onclick={toggleProfile}>
            <span class="avatar" aria-hidden="true">M</span>
            <span class="profile-name">Mori</span>
          </button>
          <form class="composer" onsubmit={submit}>
            <div class="composer-field" data-value={query}>
              <textarea bind:value={query} rows="1" aria-label="Ask Capital One" placeholder="Ask about your money, spending, or bills…"></textarea>
            </div>
            <button class="primary send" aria-label="Ask" disabled={!query.trim()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>
            </button>
          </form>
        </div>
      </header>
      <section class="container wallet" aria-label="Wallet shortcuts">
        <div class="shortcuts" role="group" aria-label="Wallet shortcuts">
          {#each shortcuts as shortcut}
            <button class="prompt" onclick={() => openChat(shortcut.prompt)}>
              {#if shortcut.icon === 'card'}
                {@render cardIcon()}
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  {#if shortcut.icon === 'gift'}
                    <path d="M4 11h16v9H4zm-1-4h18v4H3zm9 0v13m0-13H8.5A2.5 2.5 0 1 1 11 4.5zm0 0h3.5A2.5 2.5 0 1 0 13 4.5z"/>
                  {:else if shortcut.icon === 'tag'}
                    <path d="M3 4h8l10 10-7 7L3 10z"/><circle cx="7.5" cy="8.5" r="1"/>
                  {:else}
                    <path d="M19 10c0 5-7 10-7 10s-7-5-7-10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>
                  {/if}
                </svg>
              {/if}
              {shortcut.label}
            </button>
          {/each}
        </div>
      </section>
    </div>

    <main aria-label="Account overview">
      <div class="container content">
        <section class="stack" aria-labelledby="accounts-title">
          <h2 id="accounts-title" class="section-title">Your accounts</h2>
          {#each accounts as account (account.ending)}
            {@const [dollars, cents] = account.balance.split('.')}
            <article class="account {account.tint}" id={'account-' + account.ending}>
              <div class="account-top">
                <h2>{account.name} <span>•• {account.ending}</span></h2>
                {#if account.scheduled}
                  <p class="account-note">{account.scheduled}</p>
                {:else if account.ending === '1423'}
                  <p class="account-note"><button class="link" onclick={() => show('Transfer credit line', 'Move available credit from an eligible Discover card to Savor.', signIn)}>Transfer a credit line from an eligible Discover card</button></p>
                {/if}
              </div>
              <div class="account-balance">
                <div class="balance-label">
                  {account.kind}
                  <button class="visibility" aria-label={`${hidden[account.ending] ? 'Show' : 'Hide'} ${account.name} balance`} onclick={() => (hidden[account.ending] = !hidden[account.ending])}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
                      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>
                      {#if !hidden[account.ending]}<path d="m4 20 16-16"/>{/if}
                    </svg>
                  </button>
                </div>
                <div class="balance" aria-live="polite">
                  {#if hidden[account.ending]}<span aria-label="Balance hidden">••••</span>{:else}${dollars}<span class="cents">.{cents}</span>{/if}
                </div>
              </div>
              <div class="card-actions">
                <button class="pill" onclick={() => openAccount(account, account.action)}>{@render arrowIcon()} {account.action}</button>
                <button class="pill" onclick={() => openAccount(account, account.card)}>{@render cardIcon()} {account.card}</button>
              </div>
            </article>
          {/each}
        </section>

        <section class="stack tools" aria-labelledby="tools-title">
          <h2 id="tools-title" class="section-title">Your tools</h2>
          <article class="panel feature reward">
            <div class="feature-main">
              <div><h2>Explore rewards and benefits</h2><p class="reward-amount">$276.24</p><p class="muted">Rewards cash</p></div>
              <button class="primary" onclick={() => show('Your rewards', 'You have $276.24 in rewards cash.', signIn)}>View rewards</button>
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
              <div class="gauge"><div><strong>762</strong><small>Very good</small></div></div>
              <div><p>Review your credit report for signs of error, theft or fraud.</p><small class="muted">Updated Nov 13, 2026</small></div>
            </div>
            <a class="link" href="https://www.capitalone.com/creditwise/">Check your FICO® Score {@render arrowIcon()}</a>
          </article>
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
  </div>

  {#if chatOpen}
    <button class="chat-backdrop" aria-label="Close assistant" onclick={() => (chatOpen = false)}></button>
  {/if}
  <ChatPanel open={chatOpen} initialPrompt={chatPrompt} onClose={() => (chatOpen = false)} />

  <button class="profile-backdrop" tabindex="-1" aria-label="Dismiss profile panel" inert={!profileOpen} onclick={toggleProfile}></button>
  <div class="profile-panel" id="profile-panel" role="dialog" aria-modal="true" aria-labelledby="profile-title" inert={!profileOpen}>
    <div class="profile-panel-content">
      <div class="profile-panel-heading">
        <h2 id="profile-title">Mori</h2>
        <button class="panel-close quiet" bind:this={closeProfileButton} aria-label="Close profile panel" onclick={toggleProfile}>×</button>
      </div>
      <label class="theme-picker">
        Appearance
        <select value={theme} onchange={changeTheme}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </select>
      </label>
      <a class="link" href={signIn}>Manage your profile {@render arrowIcon()}</a>
    </div>
  </div>

  <dialog bind:this={dialog} aria-labelledby="dialog-title">
    {#if selected}
      <form method="dialog"><button class="close quiet" aria-label="Close">×</button></form>
      <h2 id="dialog-title">{selected.title}</h2>
      <p class="muted">{selected.detail}</p>
      {#if selected.link}<a class="primary" href={selected.link}>{selected.linkText}</a>{/if}
    {/if}
  </dialog>
</div>

<style>
  :global(body:has(.dashboard)) { margin: 0; }
  :global(html:has(.dashboard)) { scrollbar-gutter: stable; }
  :global(html:has(.dashboard.profile-open)) { overflow: hidden; }
  :global(html:has(.dashboard.chat-open)) { overflow: hidden; scrollbar-gutter: stable; }
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
    --glow-edge: var(--dark, #182e44) var(--light, #e2efff);
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
  .dashboard-body { container-type: inline-size; }
  .profile-backdrop, .profile-panel {
    position: fixed;
    visibility: hidden;
  }
  .profile-backdrop {
    inset: 0;
    z-index: 2;
    border: 0;
    background: #0b182399;
    opacity: 0;
    transition: opacity 240ms ease, visibility 240ms;
  }
  .profile-open .profile-backdrop { visibility: visible; opacity: 1; }
  .profile-panel {
    inset: 0 0 0 auto;
    z-index: 3;
    width: min(17rem, 85vw);
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--surface);
    border-left: 1px solid var(--border);
    transform: translateX(100%);
    transition: transform 240ms ease, visibility 240ms;
  }
  .profile-open .profile-panel { visibility: visible; transform: translateX(0); }
  .chat-backdrop {
    position: fixed;
    inset: 0;
    z-index: 65;
    border: 0;
    background: #0b182399;
  }
  .profile-panel-content { padding: 18px; }
  .profile-panel-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }
  .panel-close { width: 36px; height: 36px; font-size: 23px; }
  .theme-picker { display: grid; gap: 6px; margin-bottom: 18px; font-weight: 650; }
  .theme-picker select {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px 10px;
    background: var(--page);
  }
  .dashboard * { box-sizing: border-box; }
  h2, p { margin: 0; }
  h2 { font-size: 17px; line-height: 1.35; letter-spacing: -.025em; }
  button, select { font: inherit; color: inherit; }
  button, select, a { -webkit-tap-highlight-color: transparent; }
  button, select { cursor: pointer; }
  a { color: inherit; text-decoration: none; }
  :is(a, button, select):focus-visible { outline: 2px solid var(--link); outline-offset: 3px; }
  svg { width: 17px; height: 17px; flex: none; vertical-align: middle; }
  .container { width: min(1136px, calc(100% - 64px)); margin-inline: auto; }
  .header-inner {
    display: grid;
    grid-template-columns: 130px minmax(0, 720px) 130px;
    justify-content: space-between;
    align-items: start;
    gap: 16px;
    padding-block: 28px 14px;
  }
  .header-inner .brand { grid-column: 1; grid-row: 1; justify-self: start; margin-top: 4px; }
  .header-inner .composer { grid-column: 2; grid-row: 1; }
  .brand { display: inline-flex; flex: none; padding: 3px 8px; margin-left: -8px; border-radius: 8px; color: var(--dark, #fff) var(--light, #013d5b); }
  .brand :global(svg) { display: block; width: 122px; height: 44px; }
  .quiet, .link, .visibility { background: transparent; border: 0; padding: 0; }
  .quiet { color: var(--muted); }
  a.link:hover, footer a:hover { text-decoration: underline; }
  button:is(.quiet, .link):hover { color: var(--ink); }
  .profile {
    grid-column: 3;
    grid-row: 1;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 42px;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0 12px 0 5px;
    justify-self: end;
    margin-top: 8px;
    background: var(--page);
    font-size: 13px;
    font-weight: 650;
    white-space: nowrap;
  }
  .profile:hover { background: var(--surface); }
  .avatar { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--banner); color: var(--link); }
  .wallet-band {
    background:
      radial-gradient(ellipse 60% 90% at 50% 38%, var(--glow), transparent 100%),
      radial-gradient(ellipse 75% 115% at 52% 22%, var(--glow-edge), transparent 100%),
      linear-gradient(var(--surface), var(--page));
    border-bottom: 1px solid var(--border);
  }
  .wallet { width: min(720px, calc(100% - 36px)); padding-block: 0 28px; }
  .composer { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: 28px; box-shadow: 0 8px 24px #102b421c; }
  .composer:focus-within {
    border-color: color-mix(in srgb, var(--link) 65%, var(--border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--link) 15%, transparent), 0 8px 24px #102b421c;
  }
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
  .shortcuts { display: grid; gap: 2px; margin-inline: 8px; }
  .prompt {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 40px;
    padding: 7px 13px;
    background: transparent;
    border: 0;
    border-radius: 12px;
    text-align: left;
  }
  .prompt svg { color: var(--link); }
  .prompt:hover { background: color-mix(in srgb, var(--surface) 65%, transparent); }
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
  .account, .panel { box-shadow: var(--shadow); }
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
  .balance-label { display: flex; gap: 5px; align-items: center; font-size: 12px; }
  .visibility { display: grid; place-items: center; border-radius: 50%; width: 29px; height: 29px; }
  .visibility:hover { background: #ffffff25; }
  .account :is(a, button):focus-visible { outline-color: #fff; }
  .balance, .reward-amount { font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -.055em; }
  .balance { font-size: clamp(26px, 4vw, 36px); line-height: 1; font-weight: 450; }
  .cents { color: #ffffffe0; font-size: .69em; letter-spacing: -.03em; }
  .card-actions, .panel-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .account-balance { text-align: right; }
  .balance-label { justify-content: flex-end; }
  .card-actions { grid-column: 1 / -1; }
  .card-actions .pill { width: 10rem; max-width: 100%; }
  .pill, .primary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 13px; min-height: 38px; font-size: 13px; font-weight: 650; }
  .pill { background: transparent; border: 1px solid #ffffffcb; border-radius: 5px; }
  .pill:hover { background: #ffffff25; }
  .primary { background: var(--button); border: 1px solid transparent; color: var(--button-text); border-radius: 10px; text-align: center; }
  .primary:hover { opacity: .88; }
  .account-note { margin-top: 4px; font-size: 12px; }
  .account-note .link { color: inherit; }
  .account-note .link:hover { color: inherit; opacity: .85; }

  .panel { background: var(--surface); border-radius: 16px; overflow: hidden; }
  .feature { display: flex; flex-direction: column; }
  .feature-main { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 20px 22px; flex: 1; }
  .products .feature-main { align-items: flex-start; }
  .products p { margin-top: 5px; }
  .reward { background: var(--banner); }
  .reward-amount { font-size: 33px; line-height: 1.15; margin-top: 7px; }
  .muted, footer { color: var(--muted); }
  .panel-footer { gap: 20px; padding: 10px 22px; border-top: 1px solid var(--border); font-size: 13px; }
  .utility { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 17px; min-height: 172px; }
  .utility > p, .credit p { font-size: 14px; color: var(--muted); }
  .utility > .link { margin-top: auto; font-size: 13px; }
  .credit { display: flex; align-items: center; gap: 12px; }
  .gauge { flex: none; width: 78px; height: 78px; padding: 4px; border-radius: 50%; background: conic-gradient(from 225deg, #568825 0 71%, var(--border) 71% 75%, transparent 75%); }
  .gauge div { display: grid; width: 100%; height: 100%; place-content: center; text-align: center; border-radius: 50%; background: var(--surface); }
  .gauge strong { font-size: 24px; line-height: 1; }
  .gauge small { font-size: 10px; color: var(--muted); }
  footer { margin-top: 8px; padding-top: 17px; border-top: 1px solid var(--border); font-size: 13px; }
  footer nav { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 18px; margin-bottom: 8px; }
  footer a { font-weight: 650; }
  footer p { text-align: center; }

  dialog { width: min(440px, calc(100% - 32px)); background: var(--surface); color: var(--ink); border: 1px solid var(--border); border-radius: 16px; padding: 24px; }
  dialog::backdrop { background: #0b182380; }
  dialog h2 { padding-right: 26px; }
  dialog p { margin-block: 10px 16px; }
  .close { position: absolute; right: 13px; top: 9px; width: 32px; height: 32px; font-size: 23px; }

  @container (max-width: 850px) {
    .container { width: calc(100% - 36px); }
    .header-inner {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 18px 12px;
    }
    .header-inner .brand, .profile { margin-top: 0; }
    .profile { grid-column: 2; }
    .header-inner .composer { grid-column: 1 / -1; grid-row: 2; width: min(720px, 100%); justify-self: center; }
    .content { grid-template-columns: minmax(0, 1fr); }
  }
  @container (max-width: 570px) {
    .container { width: calc(100% - 28px); }
    .header-inner { padding-block-start: 20px; }
    .brand :global(svg) { width: 94px; height: 36px; }
    .wallet { padding-bottom: 20px; }
    .content { padding-top: 18px; gap: 12px; }
    .account { padding-inline: 14px; column-gap: 9px; }
    .account-top h2 { font-size: 18px; }
    .feature-main { padding-inline: 17px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .profile-backdrop, .profile-panel { transition: none; }
  }
</style>
