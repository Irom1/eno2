<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  interface Props {
    title: string;
    subtitle?: string;
    onBack: () => void;
    children: Snippet;
  }

  let { title, subtitle, onBack, children }: Props = $props();
  let backButton: HTMLButtonElement;

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      onBack();
    }
  }

  onMount(() => {
    backButton?.focus();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="view-shell" role="dialog" aria-modal="true" aria-label={title}>
  <header class="view-header">
    <div class="view-header-inner">
      <button class="back-button" bind:this={backButton} aria-label="Back to dashboard" onclick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg>
      </button>
      <div class="view-heading">
        <h1>{title}</h1>
        {#if subtitle}<p>{subtitle}</p>{/if}
      </div>
    </div>
  </header>
  <div class="view-body">
    <div class="view-content">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .view-shell {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: flex;
    flex-direction: column;
    background: var(--page);
    color: var(--ink);
  }
  .view-header {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .view-header-inner {
    display: flex;
    align-items: center;
    gap: 12px;
    width: min(1000px, 100%);
    margin-inline: auto;
    padding: 14px 20px;
  }
  .back-button {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--page);
    color: var(--ink);
  }
  .back-button:hover { background: var(--surface); }
  .back-button svg { width: 18px; height: 18px; }
  .view-heading { display: grid; gap: 1px; min-width: 0; }
  .view-heading h1 {
    margin: 0;
    font-size: 18px;
    line-height: 1.3;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  .view-heading p {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
  .view-body {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .view-content {
    width: min(1000px, 100%);
    margin-inline: auto;
    padding: 24px 20px 48px;
  }
  @media (max-width: 570px) {
    .view-header-inner { padding: 12px 14px; }
    .view-content { padding: 18px 14px 40px; }
  }
</style>
