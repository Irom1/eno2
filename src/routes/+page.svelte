<script lang="ts">
  import { onMount, tick } from 'svelte';
  import CapitalOneLogo from './[view=wallet]/CapitalOneLogo.svelte';

  type Theme = 'light' | 'dark' | 'system';
  interface Customer {
    id: string;
    firstName: string;
    lastName: string;
    city?: string;
    state?: string;
  }

  let theme = $state<Theme>('system');
  let ready = $state(false);
  let systemPrefersDark = $state(false);
  let isDark = $derived(theme === 'dark' || (theme === 'system' && systemPrefersDark));
  let accountsOpen = $state(false);
  let customers = $state<Customer[]>([]);
  let customersLoading = $state(true);
  let customersError = $state(false);
  let signInArea: HTMLDivElement;
  let signInButton: HTMLButtonElement;
  let accountList: HTMLDivElement;

  async function loadCustomers(): Promise<void> {
    customersLoading = true;
    customersError = false;
    try {
      const response = await fetch('/api/customers');
      if (!response.ok) throw new Error('Could not load accounts.');
      const payload = (await response.json()) as { customers?: Customer[] };
      customers = Array.isArray(payload.customers)
        ? payload.customers.filter((customer) => customer.id)
        : [];
    } catch {
      customersError = true;
    } finally {
      customersLoading = false;
    }
  }

  async function toggleAccounts(): Promise<void> {
    accountsOpen = !accountsOpen;
    if (accountsOpen) {
      await tick();
      accountList?.querySelector<HTMLElement>('a, button')?.focus();
    }
  }

  function handleWindowClick(event: MouseEvent): void {
    if (accountsOpen && !event.composedPath().includes(signInArea)) {
      accountsOpen = false;
    }
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (accountsOpen && event.key === 'Escape') {
      event.preventDefault();
      accountsOpen = false;
      signInButton?.focus();
    }
  }

  function toggleTheme(): void {
    theme = isDark ? 'light' : 'dark';
    try {
      localStorage.setItem('dashboard-theme', theme);
    } catch {
      // Keep the selected theme for this visit when storage is unavailable.
    }
  }

  onMount(() => {
    try {
      const saved = localStorage.getItem('dashboard-theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') theme = saved;
    } catch {
      // Fall back to the system preference when storage is unavailable.
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    systemPrefersDark = media.matches;
    const onMediaChange = (event: MediaQueryListEvent) => {
      systemPrefersDark = event.matches;
    };
    media.addEventListener('change', onMediaChange);
    ready = true;
    void loadCustomers();
    return () => media.removeEventListener('change', onMediaChange);
  });
</script>

<svelte:head>
  <title>Eno 2.0 | Capital One</title>
  <meta name="description" content="A forward looking banking experience. Sign up or choose your account to explore your Capital One dashboard with Eno 2.0." />
</svelte:head>

{#snippet arrowIcon()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
{/snippet}

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div class="landing" data-theme={theme}>
  <div class="identity container">
    <a class="brand" href="/" aria-label="Capital One | Eno 2.0 home">
      <CapitalOneLogo label="Capital One" />
      <span class="brand-divider" aria-hidden="true">|</span>
      <span class="eno-mark"><img src="/images/eno-character.png" alt="Eno character" width="1254" height="1254" /></span>
      <span class="eno-name">Eno <span>2.0</span></span>
    </a>
  </div>

  <main class="container">
    <div class="welcome">
      <h1>A forward looking<br />banking experience</h1>
      <p class="intro">Your accounts, your everyday spending, your next big move.<br class="desktop-break" /> Bring it all together, with a little help from Eno.</p>
    </div>

    <section class="entry-options" aria-label="Get started">
      <a class="entry-card sign-up" href="/signup" aria-labelledby="signup-title" aria-describedby="signup-description">
        <span class="card-top">
          <span class="entry-icon" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="10" r="5" /><path d="M4 27v-3a9 9 0 0 1 16-5m6-6v10m-5-5h10" /></svg>
          </span>
          <span class="card-label">NEW HERE?</span>
        </span>
        <span class="card-copy">
          <span class="entry-title" id="signup-title">Sign up</span>
          <span class="entry-description" id="signup-description">A fresh start for your finances.<br />Let’s take the first step together.</span>
        </span>
        <span class="card-bottom"><span>Get started</span><span class="action-icon">{@render arrowIcon()}</span></span>
      </a>

      <div class="sign-in-area" bind:this={signInArea}>
        <button
          class="entry-card sign-in"
          disabled={!ready}
          bind:this={signInButton}
          aria-labelledby="signin-title"
          aria-describedby="signin-description"
          aria-expanded={accountsOpen}
          aria-controls="account-list"
          onclick={toggleAccounts}
        >
          <span class="card-top">
            <span class="entry-icon" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="6" width="22" height="20" rx="4" /><path d="M5 12h22m-16 8h5" /></svg>
            </span>
            <span class="card-label">ALREADY WITH US?</span>
          </span>
          <span class="card-copy">
            <span class="entry-title" id="signin-title">Sign in</span>
            <span class="entry-description" id="signin-description">Welcome back. Pick up where<br />you and your money left off.</span>
          </span>
          <span class="card-bottom"><span>Choose your account</span><span class="action-icon" class:expanded={accountsOpen}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span></span>
        </button>

        <div class="account-list" id="account-list" bind:this={accountList} hidden={!accountsOpen}>
          <p class="list-heading">Choose your account</p>
          {#if customersLoading}
            <p class="list-message" role="status">Loading accounts…</p>
          {:else if customersError}
            <div class="list-message" role="status">
              <p>We couldn’t load your accounts.</p>
              <button class="retry" onclick={loadCustomers}>Try again {@render arrowIcon()}</button>
            </div>
          {:else if customers.length === 0}
            <p class="list-message" role="status">No accounts available yet.</p>
          {:else}
            <nav class="account-links" aria-label="Current accounts">
              {#each customers as customer (customer.id)}
                <a class="account-choice" href={`/dashboard?customer=${encodeURIComponent(customer.id)}`}>
                  <span class="avatar" aria-hidden="true">{customer.firstName[0]?.toUpperCase() ?? 'A'}</span>
                  <span class="account-name"><strong>{`${customer.firstName} ${customer.lastName}`.trim() || 'Account'}</strong>{#if customer.city}<small>{customer.city}{customer.state ? `, ${customer.state}` : ''}</small>{/if}</span>
                  {@render arrowIcon()}
                </a>
              {/each}
            </nav>
          {/if}
        </div>
      </div>
    </section>

    <p class="welcome-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10h8m-8 4h5" /><path d="M20 11.5a8 8 0 0 1-8 8H4l1.5-4A8 8 0 1 1 20 11.5Z" /></svg>A little clarity. A little confidence. A little Eno.</p>
  </main>

  <footer class="container">
    <p>demo only, <a href="https://github.com/Irom1/eno2">github link here</a></p>
    <button
      class="theme-toggle"
      disabled={!ready}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onclick={toggleTheme}
    >
      {#if isDark}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" /></svg>
      {/if}
    </button>
  </footer>
</div>

<style>
  :global(body:has(.landing)) { margin: 0; }
  .landing {
    --dark: ;
    --light: initial;
    --page: var(--dark, #10191f) var(--light, #f4f6f8);
    --surface: var(--dark, #18252d) var(--light, #fff);
    --ink: var(--dark, #ecf3f6) var(--light, #142632);
    --muted: var(--dark, #b1c3cc) var(--light, #50636e);
    --border: var(--dark, #31444f) var(--light, #dae3e8);
    --link: var(--dark, #9fdbf0) var(--light, #075e80);
    --glow: var(--dark, #21475f) var(--light, #c6e5fc);
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    color: var(--ink);
    background: radial-gradient(ellipse 58% 47% at 50% 28%, color-mix(in srgb, var(--glow) 42%, transparent), transparent 100%), var(--page);
    color-scheme: var(--dark, dark) var(--light, light);
    font: 15px/1.5 Inter, system-ui, sans-serif;
  }
  .landing[data-theme='dark'] { --dark: initial; --light: ; }
  @media (prefers-color-scheme: dark) {
    .landing[data-theme='system'] { --dark: initial; --light: ; }
  }
  .landing * { box-sizing: border-box; }
  .container { width: min(1136px, calc(100% - 64px)); margin-inline: auto; }
  a { color: inherit; text-decoration: none; }
  button { font: inherit; color: inherit; cursor: pointer; }
  a, button { -webkit-tap-highlight-color: transparent; }
  :is(a, button):focus-visible { outline: 3px solid var(--link); outline-offset: 5px; }
  p { margin: 0; }
  svg { width: 22px; height: 22px; flex: none; }
  .identity { display: flex; justify-content: center; padding-block: 32px 8px; }
  .brand { display: inline-flex; align-items: center; gap: 18px; padding: 4px; border-radius: 8px; color: var(--dark, #fff) var(--light, #013d5b); }
  .brand :global(svg) { display: block; width: 200px; height: 72px; }
  .brand-divider { margin-inline: 10px; color: var(--muted); font-size: 50px; font-weight: 200; }
  .eno-mark { position: relative; flex: none; width: 56px; height: 64px; }
  .eno-mark img { position: absolute; top: 46%; left: 53%; width: 80px; height: auto; max-width: none; transform: translate(-50%, -50%); }
  .eno-name { color: var(--ink); font-size: 48px; font-weight: 600; letter-spacing: -.04em; white-space: nowrap; }
  .eno-name span { color: var(--link); font-weight: 450; }
  .theme-toggle { display: grid; place-items: center; width: 42px; height: 42px; padding: 0; border: 1px solid var(--border); border-radius: 50%; background: transparent; }
  .theme-toggle:hover { background: var(--surface); }
  .theme-toggle svg { width: 19px; height: 19px; }
  main { flex: 1; display: flex; flex-direction: column; justify-content: center; padding-block: 40px 44px; }
  .welcome { text-align: center; }
  h1 { margin: 0 0 18px; font-size: clamp(32px, 4.2vw, 54px); line-height: 1.14; font-weight: 600; letter-spacing: -.045em; }
  .intro { color: var(--muted); font-size: 16px; line-height: 1.7; }
  .entry-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; width: min(816px, 100%); margin: 40px auto 0; }
  .entry-card { display: flex; flex-direction: column; justify-content: space-between; gap: 28px; width: 100%; min-height: 302px; padding: 28px 30px 22px; border: 1px solid transparent; border-radius: 20px; text-align: left; transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease; }
  .entry-card:hover { transform: translateY(-3px); box-shadow: 0 12px 28px #051b2a18; }
  .sign-up { color: #fff; background: radial-gradient(ellipse at 100% 0, #ffffff12, transparent 70%), linear-gradient(118deg, #062f4c, #126379); }
  .sign-in { height: 100%; color: var(--ink); background: var(--surface); border-color: var(--border); }
  .sign-in:hover, .sign-in[aria-expanded='true'] { border-color: var(--link); }
  .card-top, .card-bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .entry-icon { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid #ffffff40; border-radius: 12px; background: #ffffff0a; }
  .entry-icon svg { width: 28px; height: 28px; }
  .sign-in .entry-icon { color: var(--link); border-color: var(--border); background: var(--page); }
  .card-label { font-size: 10px; letter-spacing: .12em; font-weight: 600; }
  .sign-up .card-label { color: #c8e8f0; }
  .sign-in .card-label { color: var(--muted); }
  .card-copy { display: grid; gap: 9px; }
  .entry-title { font-size: 32px; line-height: 1.2; letter-spacing: -.035em; font-weight: 600; }
  .entry-description { font-size: 14px; line-height: 1.65; }
  .sign-up .entry-description { color: #d0e5ed; }
  .sign-in .entry-description { color: var(--muted); }
  .card-bottom { padding-top: 17px; border-top: 1px solid #ffffff30; font-size: 13px; font-weight: 600; }
  .sign-in .card-bottom { border-color: var(--border); color: var(--link); }
  .action-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: #ffffff18; }
  .sign-in .action-icon { background: var(--page); transition: transform 180ms ease; }
  .action-icon.expanded { transform: rotate(180deg); }
  .action-icon svg { width: 18px; height: 18px; }
  .sign-in-area { position: relative; min-width: 0; }
  .account-list { position: absolute; z-index: 5; top: calc(100% + 10px); inset-inline: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); box-shadow: 0 14px 40px #051b2a30; }
  .account-list[hidden] { display: none; }
  .list-heading { padding: 16px 18px 12px; color: var(--muted); font-size: 12px; font-weight: 600; border-bottom: 1px solid var(--border); }
  .list-message { padding: 18px; color: var(--muted); font-size: 14px; }
  .retry { display: inline-flex; align-items: center; gap: 8px; padding: 0; margin-top: 12px; background: transparent; border: 0; color: var(--link); font-weight: 600; }
  .retry svg { width: 16px; height: 16px; }
  .account-links { display: grid; max-height: 260px; overflow-y: auto; padding: 6px; }
  .account-choice { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 10px; }
  .account-choice:hover { background: var(--page); }
  .account-choice:focus-visible { outline-offset: -2px; }
  .avatar { display: grid; place-items: center; flex: none; width: 38px; height: 38px; border-radius: 50%; background: var(--page); color: var(--link); font-weight: 650; }
  .account-name { display: grid; gap: 2px; flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .account-name strong { font-size: 14px; font-weight: 600; }
  .account-name small { color: var(--muted); font-size: 12px; }
  .account-choice > svg { width: 17px; height: 17px; color: var(--link); }
  .welcome-note { display: flex; justify-content: center; align-items: center; gap: 9px; margin-top: 28px; color: var(--muted); font-size: 12px; text-align: center; }
  .welcome-note svg { width: 17px; height: 17px; color: var(--link); }
  footer { position: relative; display: flex; align-items: center; justify-content: center; min-height: 84px; padding: 22px 52px; border-top: 1px solid var(--border); color: var(--muted); font-size: 12px; text-align: center; }
  footer a { color: var(--link); text-decoration: underline; text-underline-offset: 3px; }
  footer a:hover { color: var(--ink); }
  footer .theme-toggle { position: absolute; right: 0; }
  @media (min-width: 1600px) {
    .entry-options { width: min(900px, 100%); }
    .entry-card { min-height: 330px; padding: 32px; }
  }
  @media (max-width: 640px) {
    .container { width: calc(100% - 36px); }
    .identity { padding-block: 24px 8px; }
    .brand { gap: 8px; }
    .brand :global(svg) { width: clamp(88px, 27.5vw, 118px); height: auto; }
    .brand-divider { margin-inline: 3px; font-size: 32px; }
    .eno-mark { width: clamp(30px, 9.5vw, 40px); height: 46px; }
    .eno-mark img { width: clamp(39px, 12vw, 51px); }
    .eno-name { font-size: clamp(23px, 7.4vw, 30px); }
    main { padding-block: 30px 36px; }
    .intro { font-size: 14px; max-width: 340px; margin-inline: auto; }
    .desktop-break { display: none; }
    .entry-options { gap: 14px; margin-top: 30px; }
    .entry-card { gap: 24px; padding: 20px 18px 16px; min-height: 280px; border-radius: 16px; }
    .card-label { display: none; }
    .entry-title { font-size: 27px; }
    .entry-description { font-size: 13px; }
    .entry-description br { display: none; }
    .card-bottom { font-size: 12px; }
    .action-icon { width: 27px; height: 27px; flex: none; }
  }
  @media (max-width: 420px) {
    .entry-options { grid-template-columns: 1fr; }
    .entry-card { min-height: 238px; gap: 20px; padding: 22px; }
    .sign-in { height: auto; }
    .card-label { display: block; }
    .account-list { position: relative; top: auto; margin-top: 10px; }
    .welcome-note { font-size: 11px; gap: 6px; }
    footer { font-size: 11px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .entry-card, .sign-in .action-icon { transition: none; }
    .entry-card:hover { transform: none; }
  }
</style>
