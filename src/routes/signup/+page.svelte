<script lang="ts">
  import { page } from '$app/state';
  import ExistingAccountSignup from '$lib/components/ExistingAccountSignup.svelte';
  import NewCustomerSignup from '$lib/components/NewCustomerSignup.svelte';
  const openingAccounts = $derived(page.url.searchParams.get('mode') === 'accounts');
</script>

<svelte:head>
  <title>{openingAccounts ? 'Open accounts' : 'Sign up'} with Eno | Capital One</title>
  <meta name="description" content="Say hello to Eno and set up your accounts through a friendly conversation." />
</svelte:head>

{#if openingAccounts}
  {#key page.url.searchParams.get('customer')}
    <ExistingAccountSignup customerId={page.url.searchParams.get('customer') ?? ''} />
  {/key}
{:else}
  <NewCustomerSignup />
{/if}
