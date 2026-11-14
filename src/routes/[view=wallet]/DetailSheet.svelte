<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  interface Props {
    title: string;
    onClose: () => void;
    children: Snippet;
  }

  let { title, onClose, children }: Props = $props();
  let closeButton: HTMLButtonElement;

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  onMount(() => {
    closeButton?.focus();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="sheet-layer" role="presentation" onkeydown={handleKeydown}>
  <button class="sheet-backdrop" aria-label="Close details" tabindex="-1" onclick={onClose}></button>
  <div class="sheet-card" role="dialog" aria-modal="true" aria-label={title}>
    <header class="sheet-header">
      <h2>{title}</h2>
      <button class="sheet-close" bind:this={closeButton} aria-label="Close details" onclick={onClose}>×</button>
    </header>
    <div class="sheet-body">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .sheet-layer {
    position: fixed;
    inset: 0;
    z-index: 95;
    display: grid;
    place-items: center;
    padding: 20px;
  }
  .sheet-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: var(--dark, #0009) var(--light, #0b182399);
  }
  .sheet-card {
    position: relative;
    width: min(480px, 100%);
    max-height: min(80dvh, 720px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 24px 60px #0b18234d;
  }
  .sheet-header {
    --page: var(--dark, #10191f) var(--light, #f4f6f8);
    --surface: var(--dark, #18252d) var(--light, #fff);
    --border: var(--dark, #31444f) var(--light, #dae3e8);
    --ink: var(--dark, #ecf3f6) var(--light, #142632);
    --muted: var(--dark, #b1c3cc) var(--light, #50636e);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    background: var(--surface);
    color: var(--ink);
    border-bottom: 1px solid var(--border);
  }
  .sheet-header h2 {
    margin: 0;
    font-size: 16px;
    line-height: 1.3;
    font-weight: 650;
    letter-spacing: -0.015em;
  }
  .sheet-close {
    flex: none;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
    font-size: 22px;
    line-height: 1;
  }
  .sheet-close:hover { background: var(--page); color: var(--ink); }
  .sheet-body {
    overflow-y: auto;
    padding: 16px 18px 20px;
  }
  @media (max-width: 570px) {
    .sheet-layer { place-items: end center; padding: 0; }
    .sheet-card {
      width: 100%;
      max-height: 86dvh;
      border-radius: 18px 18px 0 0;
      border-bottom: 0;
    }
  }
</style>
