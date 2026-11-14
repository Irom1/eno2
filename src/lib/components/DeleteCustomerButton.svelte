<script lang="ts">
  import { customerName, isProtectedCustomer, type CustomerIdentity } from '$lib/customerDeletion';
  let { customer, disabled = false, menuItem = false, ondelete }: { customer: CustomerIdentity & { id: string }; disabled?: boolean; menuItem?: boolean; ondelete: () => void } = $props();
</script>

{#if !isProtectedCustomer(customer)}
  <button type="button" class="delete-customer" role={menuItem ? 'menuitem' : undefined} aria-label={`Delete ${customerName(customer)}`} title={`Delete ${customerName(customer)}`} {disabled} onclick={(event) => { event.preventDefault(); event.stopPropagation(); ondelete(); }}>
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6" /></svg>
  </button>
{/if}

<style>
  .delete-customer { display: grid; place-items: center; flex: 0 0 36px; width: 36px; height: 36px; padding: 0; margin-right: 5px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer; }
  .delete-customer:hover { background: color-mix(in srgb, #d33939 12%, transparent); color: light-dark(#a72222, #ffafaf); }
  .delete-customer:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  .delete-customer:disabled { opacity: .4; cursor: default; }
</style>
