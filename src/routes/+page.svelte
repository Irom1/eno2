<script lang="ts">
  import '$lib/assets/message-composer.css';
  import { goto } from '$app/navigation';
  import CustomerDropdown from '$lib/components/CustomerDropdown.svelte';
  import { firstAccountPrompt } from '$lib/firstAccountPrompt';
  import { onMount, tick } from 'svelte';
  import Eno from '$lib/components/Eno.svelte';
  import CapitalOneLogo from './[view=wallet]/CapitalOneLogo.svelte';

  const productsList = [
    { label: 'Credit cards', href: 'https://www.capitalone.com/credit-cards/' },
    { label: 'Checking accounts', href: 'https://www.capitalone.com/bank/checking-accounts/' },
    { label: 'Savings accounts', href: 'https://www.capitalone.com/bank/savings-accounts/' },
    { label: 'Certificates of deposit (CDs)', href: 'https://www.capitalone.com/bank/cds/online-cds/' },
    { label: 'Auto financing', href: 'https://www.capitalone.com/cars/' }
  ];

  const features = [
    {
      id: 'eno',
      icon: '✦',
      title: 'AI-first banking',
      description: 'Ask Eno about your money in your own words. Powered by Gemini.'
    },
    {
      id: 'climate',
      icon: '↗',
      title: 'ClimateWise™',
      description: 'A concept for seeing the environmental impact of everyday purchases.'
    },
    {
      id: 'insights',
      title: 'Wallet insights',
      description: 'Spot spending patterns, see upcoming bills, and keep track of rewards.'
    }
  ];

  let products = $state<HTMLDetailsElement>();

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
  const themeLabel = $derived(isDark ? 'Switch to light mode' : 'Switch to dark mode');
  let accountsOpen = $state(false);
  let customers = $state<Customer[]>([]);
  let customersLoading = $state(true);
  let customersError = $state(false);
  let signInArea: HTMLDivElement;
  let signInButton: HTMLButtonElement;
  let accountList = $state<HTMLDivElement>();
  let sendingAccountPrompt = $state(false);

  async function sendAccountPrompt(event: MouseEvent & { currentTarget: HTMLAnchorElement }) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (sendingAccountPrompt) return;

    const link = event.currentTarget;
    sendingAccountPrompt = true;
    let animation: Animation | undefined;
    try {
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animation = link.animate([
          { transform: 'scale(0.97)', offset: 0.2 },
          { transform: 'translateY(-24px) scale(0.95)', opacity: 0 }
        ], { duration: 280, easing: 'ease-out', fill: 'forwards' });
        await animation.finished.catch(() => undefined);
      }
      if (link.isConnected) await goto(link.href, { state: { sentFirstAccountPrompt: true } });
    } catch {
      if (link.isConnected) location.assign(link.href);
    } finally {
      animation?.cancel();
      sendingAccountPrompt = false;
    }
  }

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

  async function setAccountsOpen(open: boolean): Promise<void> {
    accountsOpen = open;
    if (accountsOpen && products) products.open = false;
    if (accountsOpen) {
      await tick();
      accountList?.querySelector<HTMLElement>('a, button')?.focus();
    }
  }

  function openAccountsFromHero(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    signInButton.scrollIntoView({ block: 'nearest' });
    signInButton.focus({ preventScroll: true });
    void setAccountsOpen(true);
  }

  function handleWindowClick(event: MouseEvent): void {
    if (accountsOpen && !event.composedPath().includes(signInArea)) {
      accountsOpen = false;
    }
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    closeProducts(event);
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
  function closeProducts(event: KeyboardEvent) {
    if (event.key === 'Escape' && products?.open) {
      products.open = false;
      if (products.contains(document.activeElement)) products.querySelector('summary')?.focus();
    }
  }
</script>

<svelte:head>
  <title>Eno 2.0 | A new day in banking</title>
  <meta name="description" content="Explore conversational banking and get to know your wallet with the Eno 2.0 demo." />
  <link rel="preload" href="/rolling-hills.svg" as="image" />
</svelte:head>


<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div class="site landing" class:dark={isDark} data-theme={theme}>
  <header>
    <nav aria-label="Main navigation">
      <details bind:this={products}>
        <summary>Explore products <span class="chevron" aria-hidden="true"></span></summary>
        <ul>
          {#each productsList as product (product.href)}
            <li>
              <a
                href={product.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={product.label + ' (opens in a new tab)'}
              >{product.label} <span aria-hidden="true">↗</span></a>
            </li>
          {/each}
        </ul>
      </details>

      <a class="brand" href="/" aria-label="Capital One and Eno 2.0 home">
        <CapitalOneLogo label="Capital One" />
        <span class="divider"></span>
        <Eno variant={isDark ? "dark" : "light"} size={39} alt="" />
        <span>Eno 2.0</span>
      </a>

      <div class="nav-actions">
        <div class="sign-in-area" bind:this={signInArea}>
          <button type="button" id="sign-in" class="sign-in" disabled={!ready} bind:this={signInButton} aria-label="Sign in" aria-expanded={accountsOpen} aria-controls="account-list" onclick={() => setAccountsOpen(!accountsOpen)}>
            <span class="profile" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21v-2a8 6 0 0 1 16 0v2Z" />
              </svg>
            </span>
            Sign in
          </button>
          <CustomerDropdown id="account-list" {customers} dark={isDark} open={accountsOpen}
            loading={customersLoading} error={customersError} bind:element={accountList} onretry={loadCustomers} />
        </div>
        <button type="button" class="theme-toggle" disabled={!ready} aria-label={themeLabel} aria-pressed={isDark} title={themeLabel} onclick={toggleTheme}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            {#if isDark}
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            {:else}
              <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
            {/if}
          </svg>
        </button>
      </div>
    </nav>
  </header>

  <main>
    <section class="hero" aria-labelledby="hero-title">
      <div class="intro">
        <h1 id="hero-title">A new day in banking</h1>
        <p>Find out what’s <em>really</em> in your wallet.</p>
      </div>

      <div class="features">
        {#each features as feature (feature.id)}
          <article id={feature.id} tabindex="-1">
            <span class="feature-icon {feature.id}" aria-hidden="true">
              {#if feature.id === 'insights'}
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a3 3 0 0 1-3-3V7" />
                  <path d="M21 13h-4a2 2 0 0 0 0 4h4m-4-2h.01" />
                </svg>
              {:else}
                {feature.icon}
              {/if}
            </span>
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
          </article>
        {/each}
      </div>

      <div class="foreground">
        <div class="hills" aria-hidden="true"></div>
        <a class="account-link message-composer" href="/setup" onclick={sendAccountPrompt} aria-disabled={sendingAccountPrompt}>
          {firstAccountPrompt} <span class="message-send" aria-hidden="true">↑</span>
        </a>
        <span class="send-status" role="status">{sendingAccountPrompt ? 'Sending message…' : ''}</span>
        <a class="existing-account-link" href="#sign-in" onclick={openAccountsFromHero}>
          Already have an account? <strong>Sign in <span aria-hidden="true">→</span></strong>
        </a>
      </div>
    </section>
  </main>

  <footer>
    <p>Independent demo, unaffiliated with Capital One. HackUMass 2026 project.</p>
    <a href="https://github.com/Irom1/eno2">View on GitHub <span aria-hidden="true">↗</span></a>
  </footer>
</div>

<style>
  :global(body) { margin: 0; }

  .site {
    box-sizing: border-box;
    min-height: 100svh;
    padding: 0 clamp(12px, 2.4vw, 36px);
    --page: #fafbf8;
    --ink: #102b39;
    --muted: #40555b;
    --brand: #153e59;
    --surface: #fff;
    --border: #bdcdd0;
    --hover: #eaf5f8;
    --focus: #174b67;
    background: var(--page);
    color: var(--ink);
    font-family: Inter, system-ui, sans-serif;
  }

  .site.dark {
    color-scheme: dark;
    --page: #171717;
    --ink: #f5f5f5;
    --muted: #c7c7c7;
    --focus: #d6d6d6;
  }

  .dark header {
    color: #f3f7fc;
    --brand: #d5eeff;
    --surface: #1d2e3e;
    --border: #465f72;
    --hover: #2b465b;
    --focus: #a8dcf6;
  }

  header, main, footer { max-width: 1440px; margin-inline: auto; }

  header > nav {
    min-height: 84px;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 16px;
    padding-inline: clamp(4px, 1.6vw, 24px);
  }

  a { color: inherit; text-decoration: none; }
  a:focus-visible, button:focus-visible, summary:focus-visible, article:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 4px;
  }

  details { position: relative; justify-self: start; z-index: 1; }
  summary {
    display: flex;
    align-items: center;
    gap: 10px;
    list-style: none;
    cursor: pointer;
    font-weight: 550;
  }
  summary::-webkit-details-marker { display: none; }
  .chevron {
    width: 6px;
    height: 6px;
    border-right: 1.5px solid;
    border-bottom: 1.5px solid;
    transform: translateY(-2px) rotate(45deg);
  }
  details[open] .chevron { transform: translateY(2px) rotate(225deg); }
  details ul {
    position: absolute;
    top: calc(100% + 14px);
    left: 0;
    width: max-content;
    margin: 0;
    padding: 6px;
    list-style: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 10px 28px #1637461f;
  }
  details li a { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: 8px; }
  details li a:hover { background: var(--hover); }

  .brand, .sign-in { display: inline-flex; align-items: center; }
  .brand { gap: 8px; white-space: nowrap; color: var(--brand); font-size: 1.15rem; font-weight: 750; }
  .brand :global(svg) { width: 108px; height: auto; }
  .divider { width: 1px; height: 29px; margin-inline: 5px; background: var(--border); }
  .nav-actions {
    --control-background: #f4f6f8;
    --control-hover: #fff;
    --control-border: #dae3e8;
    --control-text: #142632;
    --avatar-background: #ecf4f7;
    --avatar-text: #075e80;
    display: flex;
    align-items: center;
    gap: 8px;
    justify-self: end;
  }
  .dark .nav-actions {
    --control-background: #10191f;
    --control-hover: #18252d;
    --control-border: #31444f;
    --control-text: #ecf3f6;
    --avatar-background: #1b313b;
    --avatar-text: #9fdbf0;
  }
  .theme-toggle, .sign-in {
    box-sizing: border-box;
    color: var(--control-text);
    background: var(--control-background);
    border: 1px solid var(--control-border);
  }
  .theme-toggle {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    padding: 0;
    border-radius: 50%;
    cursor: pointer;
  }
  .sign-in {
    gap: 7px;
    min-height: 42px;
    padding: 0 12px 0 5px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 650;
    white-space: nowrap;
  }
  .profile {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    background: var(--avatar-background);
    color: var(--avatar-text);
    border-radius: 50%;
  }
  .theme-toggle:hover, .sign-in:hover { background: var(--control-hover); }

  .hero {
    box-sizing: border-box;
    min-height: clamp(650px, calc(100svh - 145px), 820px);
    border-radius: clamp(22px, 3.1vw, 44px);
    overflow: hidden;
    isolation: isolate;
    display: grid;
    grid-template-rows: 1fr auto 1fr;
    justify-items: center;
    text-align: center;
    background:
      url('/images/hero-grain.png') 0 0 / 128px 128px repeat,
      radial-gradient(ellipse 36% 35% at 84% 52%, #c7b5ce 0%, transparent 100%),
      radial-gradient(ellipse 65% 38% at 18% 76%, #ffcfad 0%, transparent 100%),
      linear-gradient(173deg, #87ceeb 0%, #b1d8e7 32%, #e8d1c5 64%, #e6b3ab 100%);
  }

  .dark .hero {
    --muted: #c2d1dc;
    color: #f3f7fc;
    background:
      url('/images/hero-stars.svg') center top,
      url('/images/hero-grain.png') 0 0 / 128px 128px repeat,
      radial-gradient(ellipse 65% 38% at 18% 76%, #9d6570 0%, transparent 100%),
      linear-gradient(173deg, #101c36 0%, #203052 35%, #3e3f65 68%, #5d4969 100%);
  }
  .dark .intro p, .dark article p { color: var(--muted); }
  .dark article { background: #242424; border-color: #454545; }
  .dark .hills { filter: brightness(0.64) saturate(0.86); }

  .intro {
    align-self: center;
    padding: 32px 16px;
    translate: 0 16px;
  }

  .foreground {
    position: relative;
    isolation: isolate;
    justify-self: stretch;
    z-index: 1;
    display: grid;
    place-items: center;
    align-content: end;
    gap: 12px;
    box-sizing: border-box;
    padding: 24px 12px clamp(60px, 10vh, 104px);
  }

  .hills {
    position: absolute;
    z-index: -1;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 85%;
    pointer-events: none;
    background: url('/rolling-hills.svg') 0 0 / 100% 100% no-repeat;
  }

  .hills::after {
    content: '';
    position: absolute;
    inset: 0;
    background: url('/images/hero-grain.png') 0 0 / 128px 128px repeat;
    mask: url('/rolling-hills.svg') 0 0 / 100% 100% no-repeat;
  }

  h1 {
    margin: 0;
    font-size: clamp(2.7rem, 6.5vw, 6rem);
    line-height: 1;
    letter-spacing: -0.065em;
    font-weight: 780;
    text-wrap: balance;
  }
  .intro p {
    margin: 18px 0 0;
    color: #234352;
    font-size: clamp(1.05rem, 2.1vw, 1.65rem);
    text-wrap: balance;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(12px, 2vw, 24px);
    width: min(calc(100% - 32px), 880px);
  }
  article {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: clamp(16px, 2vw, 26px);
    border: 1px solid #ffffffb5;
    border-radius: 24px;
    background: #f6fcfbdc;
    box-shadow: 0 8px 24px #263e3e0d;
    text-align: left;
  }
  article:target { outline: 2px solid var(--focus); outline-offset: 4px; }
  .feature-icon {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 13px;
    background: #dbe3fe;
    color: #333b9c;
    font-size: 1.55rem;
    line-height: 1;
    font-weight: 700;
  }
  .climate { background: #dcf0d2; color: #286035; }
  .insights { background: #ffe8bd; color: #7a4712; }
  h2 { margin: 14px 0 6px; font-size: clamp(1.05rem, 2vw, 1.38rem); letter-spacing: -0.035em; }
  article p { margin: 0; color: #36515a; font-size: 0.95rem; line-height: 1.5; }

  .account-link {
    width: min(100%, 360px);
    color: white;
  }
  .send-status {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .existing-account-link {
    font-size: 0.9rem;
  }
  .existing-account-link strong { text-decoration: underline; text-underline-offset: 3px; }

  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px 16px;
    padding: 18px 8px;
    color: var(--muted);
    text-align: center;
    font-size: 0.85rem;
  }
  footer p { margin: 0; }
  footer a { text-decoration: underline; text-underline-offset: 3px; }

  @media (max-width: 690px) {
    header > nav { grid-template-columns: 1fr auto; gap: 12px; padding-block: 12px; min-height: 0; }
    .brand { grid-area: 1 / 1; }
    .nav-actions { grid-area: 1 / 2; }
    details { grid-column: 1 / -1; padding-block: 5px; font-size: 0.9rem; }
    .hero { min-height: 0; grid-template-rows: auto auto auto; }
    .intro { padding-top: 48px; }
    .features {
      grid-template-columns: 1fr;
      max-width: 420px;
    }
    article { display: grid; grid-template-columns: 42px 1fr; gap: 4px 12px; }
    .feature-icon { grid-row: span 2; }
    h2 { margin: 0; }
    article { padding-bottom: 16px; }
    .foreground { min-height: 175px; }
  }

  @media (max-width: 390px) {
    header > nav { grid-template-columns: 1fr auto; }
    .brand { grid-area: 1 / 1 / 2 / -1; }
    .nav-actions { grid-area: 2 / 2; }
    details { grid-area: 2 / 1; }
  }

  @media (max-width: 440px) {
    .brand { font-size: 1rem; gap: 4px; }
    .brand :global(svg) { width: 84px; }
    .brand :global(img) { width: 28px; height: 28px; }
  }

  .sign-in-area { position: relative; }
  button.sign-in { font-family: inherit; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
</style>
