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
    border: 1px solid color-mix(in srgb, var(--ink) 24%, var(--border));
    border-radius: 14px;
    padding: 12px 14px;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    box-shadow:
      0 8px 24px color-mix(in srgb, var(--ink) 12%, transparent),
      0 1px 2px color-mix(in srgb, var(--ink) 10%, transparent);
  }
</style>
