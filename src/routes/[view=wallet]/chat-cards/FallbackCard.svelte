<script lang="ts">
  import { asItems, asRecord } from '$lib/chat/cards.js';
  import ChatCardShell from './ChatCardShell.svelte';

  interface Props {
    payload: unknown;
  }

  let { payload }: Props = $props();

  const data = $derived(asRecord(payload));
  const items = $derived(asItems(payload));
  const count = $derived(
    typeof data.count === 'number' ? data.count : items.length
  );
</script>

<ChatCardShell title="More information">
  {#if count > 0}
    <p class="summary">
      {count} {count === 1 ? 'record' : 'records'} ready in your account view.
    </p>
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
