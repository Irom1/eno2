<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    badge?: string;
    children?: Snippet;
  }

  let { title, badge, children }: Props = $props();
</script>

<section class="chat-card">
  {#if title || badge}
    <header class="card-head" class:has-title={Boolean(title)}>
      {#if title}<h3>{title}</h3>{/if}
      {#if badge}<span class="badge">{badge}</span>{/if}
    </header>
  {/if}
  <div class="card-body">
    {@render children?.()}
  </div>
</section>

<style>
  .chat-card {
    width: 100%;
    min-width: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 12px 14px;
    color: var(--ink);
    box-sizing: border-box;
    font-variant-numeric: tabular-nums;
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .card-head.has-title {
    padding-bottom: 9px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 10px;
  }
  h3 {
    margin: 0;
    min-width: 0;
    font-size: 14.5px;
    line-height: 1.3;
    font-weight: 650;
    letter-spacing: -0.015em;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .badge {
    flex: none;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--banner);
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 650;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .card-body {
    min-width: 0;
    font-size: 12.75px;
    line-height: 1.45;
  }
</style>
