<script lang="ts">
  import DeleteCustomerButton from './DeleteCustomerButton.svelte';
  import CustomerRemovalNotice from './CustomerRemovalNotice.svelte';
  import { orderCustomers } from '$lib/customerSelection';
  import type { RemovedCustomer } from '$lib/customerRemoval';

  interface Customer { id: string; firstName: string; lastName: string; city?: string; state?: string }
  let {
    customers, id, dark = false, open = true, loading = false, error = false,
    activeId = '', deletingId = '', removed = null, removalError = '',
    element = $bindable(), onselect, ondelete, onundo, onretry
  }: {
    customers: Customer[]; id: string; dark?: boolean; open?: boolean; loading?: boolean; error?: boolean;
    activeId?: string; deletingId?: string; removed?: RemovedCustomer | null; removalError?: string;
    element?: HTMLDivElement; onselect?: (id: string) => void; ondelete?: (customer: Customer) => void;
    onundo?: () => void; onretry?: () => void;
  } = $props();
  let orderedCustomers = $derived(orderCustomers(customers));
</script>

{#snippet arrow(selected = false)}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#if selected}<path d="m5 12 5 5 9-10" />{:else}<path d="M5 12h14m-6-6 6 6-6 6" />{/if}
  </svg>
{/snippet}

{#snippet identity(customer: Customer)}
  <span class="avatar" aria-hidden="true">{customer.firstName[0]?.toUpperCase() ?? 'A'}</span>
  <span class="account-name"><strong>{`${customer.firstName} ${customer.lastName}`.trim() || 'Account'}</strong>{#if customer.city}<small>{customer.city}{customer.state ? `, ${customer.state}` : ''}</small>{/if}</span>
{/snippet}

<div class="customer-dropdown {onselect ? 'account-dropdown' : 'account-list'}" class:dark {id} hidden={!open} role={onselect ? 'menu' : undefined} aria-label={onselect ? 'Switch account' : undefined} bind:this={element}>
  <p class="list-heading">Choose your account</p>
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
          {#if onselect}
            <button type="button" class="account-choice account-option" role="menuitemradio" aria-checked={customer.id === activeId} onclick={() => onselect?.(customer.id)}>
              {@render identity(customer)}{@render arrow(customer.id === activeId)}
            </button>
          {:else}
            <a class="account-choice" href={`/dashboard?customer=${encodeURIComponent(customer.id)}`}>
              {@render identity(customer)}{@render arrow()}
            </a>
          {/if}
          {#if ondelete}<DeleteCustomerButton {customer} disabled={!!deletingId} ondelete={() => ondelete?.(customer)} />{/if}
        </div>
      {/each}
    </nav>
  {/if}
  {#if onundo}<CustomerRemovalNotice {removed} error={removalError} busy={!!deletingId} {onundo} />{/if}
</div>

<style>
  .customer-dropdown {
    --surface: #fff; --ink: #102b39; --muted: #40555b; --brand: #153e59;
    --border: #bdcdd0; --hover: #eaf5f8; --avatar-background: #ecf4f7; --avatar-text: #075e80;
    position: absolute; top: calc(100% + 12px); right: 0; z-index: 30;
    width: min(320px, calc(100vw - 48px)); padding: 8px;
    border: 1px solid var(--border); border-radius: 16px; background: var(--surface);
    box-shadow: 0 12px 30px #16374626; text-align: left; color: var(--ink);
    color-scheme: light; font: 14px/1.45 Inter, system-ui, sans-serif;
  }
  .customer-dropdown.dark { --surface: #1d2e3e; --ink: #f3f7fc; --muted: #c2d1dc; --brand: #d5eeff; --border: #465f72; --hover: #2b465b; --avatar-background: #1b313b; --avatar-text: #9fdbf0; color-scheme: dark; }
  .customer-dropdown, .customer-dropdown :global(*) { box-sizing: border-box; }
  .customer-dropdown[hidden] { display: none; }
  .list-heading { margin: 8px 10px 12px; color: var(--muted); font-size: 12px; }
  .account-links { display: grid; gap: 3px; max-height: min(340px, 55dvh); overflow-y: auto; }
  .customer-row { display: flex; align-items: center; border-radius: 10px; }
  .customer-row:hover { background: var(--hover); }
  .account-choice { flex: 1; min-width: 0; display: flex; align-items: center; gap: 11px; padding: 11px; border: 0; border-radius: 10px; background: transparent; color: inherit; text-align: left; text-decoration: none; font: inherit; cursor: pointer; }
  .account-choice:hover, .account-choice[aria-checked='true'] { background: var(--hover); }
  .account-choice:focus-visible, .retry:focus-visible { outline: 2px solid var(--avatar-text); outline-offset: -2px; }
  .avatar { display: grid; place-items: center; flex: 0 0 36px; height: 36px; border-radius: 50%; color: var(--avatar-text); background: var(--avatar-background); font-weight: 650; }
  .account-name { flex: 1; min-width: 0; }
  .account-name strong { display: block; font-size: 14px; font-weight: 650; overflow-wrap: anywhere; }
  .account-name small { display: block; color: var(--muted); font-size: 12px; }
  svg { width: 18px; height: 18px; flex: none; }
  .list-message { margin: 0; padding: 10px; color: var(--muted); font-size: 13px; }
  .list-message p { margin: 0 0 10px; }
  .retry { display: inline-flex; align-items: center; gap: 8px; padding: 6px 0; border: 0; color: var(--brand); background: transparent; font: inherit; cursor: pointer; }
</style>
