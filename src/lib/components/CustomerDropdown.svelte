<script lang="ts">
  import { orderCustomers } from '$lib/customerSelection';

  interface Customer { id: string; firstName: string; lastName: string; city?: string; state?: string }
  let {
    customers, id, dark = false, open = true, loading = false, error = false,
    activeId = '', element = $bindable(), onselect, onretry, onsignout,
    signingOut = false, signOutError = ''
  }: {
    customers: Customer[]; id: string; dark?: boolean; open?: boolean; loading?: boolean; error?: boolean;
    activeId?: string;
    element?: HTMLDivElement; onselect?: (id: string) => void;
    onretry?: () => void;
    onsignout?: () => void; signingOut?: boolean; signOutError?: string;
  } = $props();
  let orderedCustomers = $derived(orderCustomers(customers));
</script>

{#snippet arrow()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 12h14m-6-6 6 6-6 6" />
  </svg>
{/snippet}

{#snippet identity(customer: Customer)}
  <span class="avatar" aria-hidden="true">{customer.firstName[0]?.toUpperCase() ?? 'A'}</span>
  <span class="account-name"><strong>{`${customer.firstName} ${customer.lastName}`.trim() || 'Account'}</strong>{#if customer.city}<small>{customer.city}{customer.state ? `, ${customer.state}` : ''}</small>{/if}</span>
{/snippet}

<div class="customer-dropdown {onselect ? 'account-dropdown' : 'account-list'}" class:dark {id} hidden={!open} role={onselect ? 'menu' : undefined} aria-label={onselect ? 'Switch account' : undefined} bind:this={element}>
  <p class="list-heading">{onselect ? 'Switch account' : 'Sign in'}</p>
  {#if loading}
    <p class="list-message" role="status">Loading accounts…</p>
  {:else if error}
    <div class="list-message" role="status"><p>We couldn’t load your accounts.</p>{#if onretry}<button class="retry" onclick={onretry}>Try again {@render arrow()}</button>{/if}</div>
  {:else if orderedCustomers.length === 0}
    <p class="list-message" role="status">No accounts available yet.</p>
  {:else}
    <nav class="account-links" role={onselect ? 'group' : undefined} aria-label="Current accounts">
      {#each orderedCustomers as customer (customer.id)}
        <div class="customer-row" role={onselect ? 'none' : undefined}>
          <a class="account-choice account-option" href={`/dashboard?customer=${encodeURIComponent(customer.id)}`}
            role={onselect ? 'menuitemradio' : undefined} aria-checked={onselect ? customer.id === activeId : undefined}
            onclick={(event) => { if (onselect) { event.preventDefault(); onselect(customer.id); } }}>
            {@render identity(customer)}
            {#if onselect && customer.id === activeId}
              <span class="current-indicator" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12 4 4 8-8" /></svg>
              </span>
            {:else}
              <span class="choice-arrow">{@render arrow()}</span>
            {/if}
          </a>
        </div>
      {/each}
    </nav>
  {/if}
  {#if onsignout}
    <div class="account-footer" role="none">
      <button class="account-choice sign-out" role="menuitem" onclick={onsignout} disabled={signingOut}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h5m3-11 4 4-4 4m-5-4h9" />
        </svg>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
      {#if signOutError}<p class="list-message" role="alert">{signOutError}</p>{/if}
    </div>
  {/if}
</div>

<style>
  .customer-dropdown {
    --surface: #fff;
    --ink: #142632;
    --muted: #506572;
    --brand: #075e80;
    --border: #cddae0;
    --divider: #e2ebef;
    --hover: #f0f6f8;
    --selection: #e4f2f7;
    --avatar-background: #edf3f6;
    --shadow: 0 16px 36px #14263226, 0 2px 6px #14263212;
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 30;
    width: min(320px, calc(100vw - 48px));
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    box-shadow: var(--shadow);
    text-align: left;
    color: var(--ink);
    color-scheme: light;
    font: 14px/1.35 var(--font-sans);
  }
  .customer-dropdown.dark {
    --surface: #18252d;
    --ink: #ecf3f6;
    --muted: #aebfc9;
    --brand: #a0dbef;
    --border: #3b515e;
    --divider: #31444f;
    --hover: #22343f;
    --selection: #243d4a;
    --avatar-background: #263b46;
    --shadow: 0 16px 36px #0006, 0 2px 6px #0003;
    color-scheme: dark;
  }
  .customer-dropdown, .customer-dropdown :global(*) { box-sizing: border-box; }
  .customer-dropdown[hidden] { display: none; }
  .list-heading { margin: 0; padding: 9px 10px 8px; font-size: 13px; font-weight: 700; }
  .account-links {
    display: grid;
    gap: 2px;
    max-height: min(334px, 55dvh);
    overflow-y: auto;
    overscroll-behavior-y: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .account-choice {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 54px;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    text-align: left;
    text-decoration: none;
    font: inherit;
    cursor: pointer;
  }
  .account-choice:hover, .account-choice:focus-visible { background: var(--hover); }
  .account-choice[aria-checked='true'] { background: var(--selection); }
  .account-footer { border-top: 1px solid var(--divider); margin-top: 6px; padding-top: 6px; }
  .sign-out { width: 100%; min-height: 44px; font-weight: 650; }
  .sign-out svg, .choice-arrow { color: var(--muted); }
  .sign-out:disabled { cursor: wait; }
  .account-choice:focus-visible, .retry:focus-visible { outline: 2px solid var(--brand); outline-offset: -2px; }
  .avatar {
    display: grid;
    place-items: center;
    flex: 0 0 32px;
    height: 32px;
    border-radius: 50%;
    color: var(--brand);
    background: var(--avatar-background);
    font-size: 13px;
    font-weight: 700;
  }
  .account-name { flex: 1; min-width: 0; }
  .account-name strong { display: block; font-size: 14px; font-weight: 650; overflow-wrap: anywhere; }
  .account-name small { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; }
  .choice-arrow, .current-indicator { display: grid; place-items: center; width: 22px; flex: none; }
  .current-indicator { height: 22px; border-radius: 50%; background: var(--surface); color: var(--brand); }
  .current-indicator svg { width: 14px; height: 14px; }
  svg { width: 17px; height: 17px; flex: none; }
  .list-message { margin: 0; padding: 10px; color: var(--muted); font-size: 13px; }
  .list-message p { margin: 0 0 10px; }
  .retry { display: inline-flex; align-items: center; gap: 8px; padding: 6px 0; border: 0; color: var(--brand); background: transparent; font: inherit; cursor: pointer; }
</style>
