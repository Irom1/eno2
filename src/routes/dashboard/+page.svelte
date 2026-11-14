<script lang="ts">
  import { onMount } from 'svelte';

  type Theme = 'light' | 'dark' | 'system';

  const accounts = [
    { name: '360 Checking', ending: '3324', balance: '10.03', kind: 'Available balance', tint: 'aqua', action: 'View account', card: 'View debit card' },
    { name: 'Quicksilver', ending: '5421', balance: '473.98', kind: 'Current balance', tint: 'slate', action: 'Make a payment', scheduled: '$473.95 in scheduled payments', card: 'Get virtual card' },
    { name: 'Discover it', ending: '0734', balance: '656.81', kind: 'Current balance', tint: 'peach', action: 'Make a payment', scheduled: '$259.00 in scheduled payments', card: 'Get virtual card' },
    { name: 'Savor', ending: '1423', balance: '0.00', kind: 'Current balance', tint: 'rose', action: 'View account', card: 'Get virtual card' }
  ];

  const signIn = 'https://www.capitalone.com/sign-in/';
  const helpCenter = 'https://www.capitalone.com/help-center/';
  const referral = 'Earn $100 for each approved referral, up to $500 per year.';
  const offers = [
    { store: 'Walmart', amount: '5% back' },
    { store: 'Apple', amount: '10% back' },
    { store: 'eBay', amount: 'Up to 10% back' }
  ];

  let theme = $state<Theme>('system');
  let hidden = $state<Record<string, boolean>>({});
  const shortcuts = [
    { label: 'Virtual cards', keywords: ['virtual', 'digital card'], detail: 'Choose an eligible credit card to manage your virtual cards.', link: signIn, linkText: 'Manage virtual cards' },
    { label: 'Referral bonuses', keywords: ['refer', 'bonus', 'friend'], detail: referral, link: signIn, linkText: 'Refer a friend' },
    { label: 'Shopping offers', keywords: ['shop', 'offer', 'cash back', ...offers.map((offer) => offer.store.toLowerCase())], detail: offers.map((offer) => `${offer.store}: ${offer.amount}`).join(' · '), link: signIn, linkText: 'View offers' },
    { label: 'ATM finder', keywords: ['atm', 'branch', 'location', 'near me'], detail: 'Find a Capital One branch, Café or ATM near you.', link: 'https://locations.capitalone.com/', linkText: 'Find a location' }
  ];

  let query = $state('');
  let request = $state('');

  let matchingShortcuts = $derived(request ? shortcuts.filter((shortcut) =>
    shortcut.keywords.some((keyword) => request.toLowerCase().includes(keyword))
  ) : []);
  let matchingAccounts = $derived(request ? accounts.filter((account) => {
    const term = request.toLowerCase();
    return /\b(accounts?|balances?|payments?)\b/.test(term) ||
      term.includes(account.ending) ||
      account.name.toLowerCase().split(' ').some((word) => word.length > 2 && term.includes(word));
  }) : []);

  function search(event: SubmitEvent) {
    event.preventDefault();
    request = query.trim();
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

<div class="dashboard" data-theme={theme}>
  <header class="header">
    <div class="container header-inner">
      <a class="brand" href="/dashboard"><img src="https://upload.wikimedia.org/wikipedia/commons/9/98/Capital_One_logo.svg" width="122" height="44" alt="Capital One dashboard" /></a>
      <div class="header-actions">
        <label class="theme-picker">
          <span>Appearance</span>
          <select aria-label="Appearance" value={theme} onchange={changeTheme}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </label>
        <button class="quiet help" onclick={() => show('Need help?', 'Find account support and ways to reach Capital One.', helpCenter, 'Open help center')}>Need help?</button>
        <button class="quiet profile" onclick={() => show('Mori', 'Manage your profile and preferences on Capital One.', signIn)}><span class="avatar" aria-hidden="true">M</span> Mori <span aria-hidden="true">⌄</span></button>
      </div>
    </div>
  </header>

  <main class="container content" aria-label="Account overview">
    <section class="wallet" aria-labelledby="wallet-title">
      <h1 id="wallet-title">Search your wallet</h1>
      <form class="composer" onsubmit={search}>
        <textarea bind:value={query} rows="2" aria-label="Search your wallet" placeholder="What do you want to find in your wallet?"></textarea>
        <button class="primary send" aria-label="Search" disabled={!query.trim()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg>
        </button>
      </form>
      <div class="shortcuts" aria-label="Wallet shortcuts">
        {#each shortcuts as shortcut}
          <button class="chip" onclick={() => show(shortcut.label, shortcut.detail, shortcut.link, shortcut.linkText)}>{shortcut.label}</button>
        {/each}
      </div>
      {#if request}
        <div class="search-results" aria-live="polite">
          <div class="search-heading"><h2>Results</h2><button class="quiet" onclick={() => { request = ''; query = ''; }}>Clear</button></div>
          {#each matchingShortcuts as shortcut}
            <p><a class="link" href={shortcut.link}>{shortcut.label} {@render arrowIcon()}</a> · {shortcut.detail}</p>
          {/each}
          {#each matchingAccounts as account}
            <p><a class="link" href={'#account-' + account.ending}>{account.name} •• {account.ending}</a>{#if !hidden[account.ending]} · ${account.balance}{/if}</p>
          {/each}
          {#if !matchingShortcuts.length && !matchingAccounts.length}
            <p>Try an account name or a shortcut such as “virtual cards” or “ATM.”</p>
          {/if}
        </div>
      {/if}
    </section>

    <section class="stack" aria-labelledby="accounts-title">
      <h2 id="accounts-title" class="section-title">Your accounts</h2>
      {#each accounts as account (account.ending)}
        {@const [dollars, cents] = account.balance.split('.')}
        <article class="account {account.tint}" id={'account-' + account.ending}>
          <div class="account-top">
            <h2>{account.name} <span>•• {account.ending}</span></h2>
          </div>
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
          <div class="card-actions">
            <button class="pill" onclick={() => openAccount(account, account.action)}>{@render arrowIcon()} {account.action}</button>
            <button class="pill" onclick={() => openAccount(account, account.card)}>{@render cardIcon()} {account.card}</button>
          </div>
          {#if account.scheduled}
            <p class="account-note">{account.scheduled}</p>
          {:else if account.ending === '1423'}
            <p class="account-note"><button class="link" onclick={() => show('Transfer credit line', 'Move available credit from an eligible Discover card to Savor.', signIn)}>Transfer a credit line from an eligible Discover card</button></p>
          {/if}
        </article>
      {/each}
    </section>

    <section class="stack" aria-label="Rewards and products">
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
    </section>

    <section aria-label="Credit tools">
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
  </main>

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
    --banner: var(--dark, #1b313b) var(--light, #ecf4f7);
    min-height: 100vh;
    background: var(--dark, #10191f) var(--light, #f4f6f8);
    color: var(--ink);
    color-scheme: var(--dark, dark) var(--light, light);
    font: 15px/1.45 Inter, system-ui, sans-serif;
  }
  .dashboard[data-theme='dark'] { --dark: initial; --light: ; }
  @media (prefers-color-scheme: dark) {
    .dashboard[data-theme='system'] { --dark: initial; --light: ; }
  }
  .dashboard * { box-sizing: border-box; }
  h1, h2, p { margin: 0; }
  h2 { font-size: 17px; line-height: 1.35; letter-spacing: -.025em; }
  button, select { font: inherit; color: inherit; }
  button, select, a { -webkit-tap-highlight-color: transparent; }
  button, select { cursor: pointer; }
  a { color: inherit; text-decoration: none; }
  :is(a, button, select):focus-visible { outline: 2px solid var(--link); outline-offset: 3px; }
  svg { width: 17px; height: 17px; flex: none; vertical-align: middle; }
  .container { width: min(1136px, calc(100% - 64px)); margin-inline: auto; }
  .header { background: var(--surface); border-bottom: 1px solid var(--border); }
  .header-inner, .header-actions { display: flex; align-items: center; gap: 16px; }
  .header-inner { min-height: 73px; justify-content: space-between; }
  .brand { display: inline-flex; flex: none; padding: 3px 8px; margin-left: -8px; border-radius: 5px; background: #fff; }
  .brand img { display: block; width: 122px; height: 44px; object-fit: contain; }
  .quiet, .link, .visibility { background: transparent; border: 0; padding: 0; }
  .quiet { color: var(--muted); }
  .quiet:hover, .link:hover, footer a:hover { text-decoration: underline; }
  .profile, .theme-picker { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  .theme-picker { color: var(--muted); font-size: 13px; }
  select { background: var(--surface); color: var(--ink); border: 1px solid var(--border); border-radius: 9px; padding: 7px; }
  .avatar { display: grid; place-items: center; width: 31px; height: 31px; border-radius: 50%; background: var(--banner); color: var(--link); font-weight: 700; }
  .wallet { width: min(740px, 100%); margin: 15px auto 20px; }
  h1 { font-size: clamp(25px, 4vw, 34px); font-weight: 650; letter-spacing: -.035em; text-align: center; margin-bottom: 14px; }
  .composer { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; box-shadow: var(--shadow); }
  .composer:focus-within { outline: 2px solid var(--link); outline-offset: 2px; }
  .composer textarea { display: block; resize: vertical; width: 100%; min-height: 128px; padding: 18px 66px 45px 18px; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; }
  .composer textarea::placeholder { color: var(--muted); }
  .send { position: absolute; right: 12px; bottom: 12px; width: 38px; padding: 0; }
  .send:disabled { opacity: .45; cursor: default; }
  .shortcuts { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
  .chip { background: var(--surface); color: var(--link); border: 1px solid var(--border); border-radius: 99px; padding: 7px 13px; font-size: 13px; font-weight: 650; }
  .chip:hover { border-color: var(--link); }
  .search-results { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-top: 14px; padding: 15px; }
  .search-heading { display: flex; justify-content: space-between; }
  .search-results p { margin-top: 8px; }
  .link { display: inline-flex; align-items: center; gap: 5px; color: var(--link); font-weight: 650; text-align: left; }
  .link svg { width: 15px; height: 15px; }

  .content { padding-block: 24px 40px; display: grid; gap: 18px; }
  .stack { display: grid; gap: 14px; }
  .section-title { font-size: 23px; }
  .account, .panel { border: 1px solid var(--border); box-shadow: var(--shadow); }
  .account {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'title actions' 'balance actions' 'label actions' 'note note';
    gap: 5px 16px;
    padding: 20px 23px;
    border-radius: 15px;
    color: #fff;
    background: var(--account-color);
    scroll-margin-top: 18px;
  }
  .aqua { --account-color: #063f5a; }
  .slate { --account-color: #465363; }
  .peach { --account-color: #a83e23; }
  .rose { --account-color: #913a31; }
  .account-top { grid-area: title; }
  .account-top h2 { font-size: 21px; font-weight: 550; }
  .account-top h2 span { font-size: 12px; margin-left: 4px; white-space: nowrap; }
  .balance-label { grid-area: label; display: flex; gap: 5px; align-items: center; font-size: 12px; text-transform: uppercase; }
  .visibility { display: grid; place-items: center; border-radius: 50%; width: 29px; height: 29px; }
  .visibility:hover { background: #ffffff25; }
  .account :is(a, button):focus-visible { outline-color: #fff; }
  .balance, .reward-amount { font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -.055em; }
  .balance { grid-area: balance; font-size: clamp(35px, 5vw, 48px); line-height: 1; font-weight: 450; }
  .cents { color: #ffffffe0; font-size: .69em; letter-spacing: -.03em; }
  .card-actions, .panel-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .card-actions { grid-area: actions; align-self: center; justify-content: flex-end; }
  .pill, .primary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 13px; min-height: 38px; font-size: 13px; font-weight: 650; }
  .pill { background: transparent; border: 1px solid #ffffffcb; border-radius: 5px; }
  .pill:hover { background: #ffffff25; }
  .primary { background: var(--button); border: 1px solid transparent; color: var(--button-text); border-radius: 10px; text-align: center; }
  .primary:hover { opacity: .88; }
  .account-note { grid-area: note; margin-top: 5px; font-size: 12px; }
  .account-note .link { color: inherit; text-decoration: underline; }

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
  footer nav { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-bottom: 8px; }
  footer a { font-weight: 650; }

  dialog { width: min(440px, calc(100% - 32px)); background: var(--surface); color: var(--ink); border: 1px solid var(--border); border-radius: 16px; padding: 24px; }
  dialog::backdrop { background: #0b182380; }
  dialog h2 { padding-right: 26px; }
  dialog p { margin-block: 10px 16px; }
  .close { position: absolute; right: 13px; top: 9px; width: 32px; height: 32px; font-size: 23px; }

  @media (max-width: 850px) {
    .container { width: calc(100% - 36px); }
  }
  @media (max-width: 570px) {
    .container { width: calc(100% - 28px); }
    .header-inner { min-height: 62px; }
    .header-actions { gap: 9px; }
    .theme-picker span, .help { display: none; }
    .content { padding-top: 14px; gap: 12px; }
    .account { grid-template-columns: 1fr; grid-template-areas: 'title' 'balance' 'label' 'actions' 'note'; padding-inline: 17px; }
    .card-actions { justify-content: flex-start; margin-top: 4px; }
    .feature-main { padding-inline: 17px; }
  }
</style>
