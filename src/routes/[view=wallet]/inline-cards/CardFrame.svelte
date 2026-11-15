<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label?: string;
    children: Snippet;
  }

  let { label, children }: Props = $props();
</script>

<article class="entity-card" aria-label={label}>
  {@render children()}
</article>

<style>
  .entity-card {
    position: relative;
    overflow: hidden;
    width: 100%;
    /* Same cap as the Eno chat bubble (.bubble in ChatPanel.svelte). */
    max-width: 88%;
    align-self: flex-start;
    min-width: 0;
    box-sizing: border-box;
    background: var(--surface);
    border: var(--chat-bubble-border);
    border-radius: var(--assistant-bubble-radius);
    padding: 12px 14px;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 570px) {
    .entity-card { max-width: 96%; }
  }
</style>
