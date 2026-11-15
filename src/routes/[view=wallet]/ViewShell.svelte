<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  interface Props {
    title: string;
    subtitle?: string;
    onBack: () => void;
    returnLabel?: string;
    onReturn?: () => void;
    children: Snippet<[Snippet]>;
  }

  let { title, subtitle, onBack, returnLabel, onReturn, children }: Props = $props();
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

{#snippet heading()}
    <div class="view-header-inner">
      <button class="back-button" type="button" bind:this={backButton} aria-label="Back to dashboard" onclick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 12H5m6-6-6 6 6 6"/>
        </svg>
      </button>
      <div class="view-heading">
        <h1>{title}</h1>
        {#if subtitle}<p>{subtitle}</p>{/if}
      </div>
    </div>
{/snippet}

<div class="view-shell" role="dialog" aria-modal="true" aria-label={title}>
  {#if returnLabel && onReturn}
    <div class="view-topbar">
      <button class="return-chat-button" type="button" aria-label={returnLabel} onclick={onReturn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
        <span>{returnLabel}</span>
      </button>
    </div>
  {/if}
  <div class="view-body">
    <div class="view-content">
      {@render children(heading)}
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
  .view-topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    flex: none;
    padding: 8px max(20px, calc((100% - 960px) / 2));
    background: var(--page);
    border-bottom: 1px solid var(--border);
  }
  .view-header-inner {
    grid-column: content;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .back-button {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
    transition: background 140ms ease;
  }
  .back-button:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
  .back-button:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  .back-button svg { width: 18px; height: 18px; }
  .return-chat-button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 40px;
    padding: 0 14px 0 11px;
    border: 1px solid color-mix(in srgb, currentColor 22%, var(--border));
    border-radius: 999px;
    background: var(--surface);
    color: inherit;
    font-size: 13px;
    font-weight: 650;
    line-height: 1;
    cursor: pointer;
    transition: background 140ms ease, border-color 140ms ease;
  }
  .return-chat-button:hover { background: color-mix(in srgb, currentColor 8%, var(--surface)); }
  .return-chat-button:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 2px;
  }
  .return-chat-button svg { width: 16px; height: 16px; flex: none; }
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
    opacity: .8;
    font-size: 12px;
  }
  .view-body {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .view-content {
    --gutter: 20px;
    display: grid;
    grid-template-columns:
      [full-start] minmax(var(--gutter), 1fr)
      [content-start] minmax(0, 960px)
      [content-end] minmax(var(--gutter), 1fr) [full-end];
    padding-block-end: 48px;
  }
  .view-content > :global(*) { grid-column: content; }
  .view-content > :global([data-full-width]) { grid-column: full; }
  @media (max-width: 570px) {
    .view-topbar {
      padding-inline: 14px;
    }
    .view-content {
      --gutter: 14px;
      padding-block-end: 40px;
    }
  }
</style>
