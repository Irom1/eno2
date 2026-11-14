<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    summary: string;
    children: Snippet;
  }

  let { summary, children }: Props = $props();
</script>

<details class="expand-row">
  <summary>{summary}</summary>
  <div class="body">
    {@render children()}
  </div>
</details>

<style>
  .expand-row {
    min-width: 0;
    color: var(--ink);
    font-size: 12.5px;
    line-height: 1.35;
  }
  summary {
    cursor: pointer;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
  }
  .body {
    padding-top: 6px;
  }
</style>
