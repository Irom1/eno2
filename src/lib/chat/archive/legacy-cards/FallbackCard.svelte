<script lang="ts">
  import { asItems } from '$lib/chat/cards.js';
  import ChatCardShell from './ChatCardShell.svelte';

  interface Props {
    payload: unknown;
  }

  let { payload }: Props = $props();

  const items = $derived(asItems(payload));
</script>

<ChatCardShell>
  {#if items.length > 0}
    <p class="summary">Full details are available in your account view.</p>
  {:else}
    <p class="empty">No extra details to show right now.</p>
  {/if}
</ChatCardShell>

<style>
  .summary,
  .empty {
    margin: 0;
    color: var(--muted);
  }
</style>
