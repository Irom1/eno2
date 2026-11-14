<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import CapitalOneLogo from './CapitalOneLogo.svelte';

  interface Props {
    title: string;
    subtitle?: string;
    cardActivity?: boolean;
    profileName?: string;
    onBack: () => void;
    children: Snippet;
  }

  let { title, subtitle, cardActivity = false, profileName, onBack, children }: Props = $props();
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

<div class="view-shell" class:card-activity={cardActivity} role="dialog" aria-modal="true" aria-label={title}>
  <header class="view-header">
    <div class="view-header-inner">
      <button class="back-button" bind:this={backButton} aria-label="Back to dashboard" onclick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          {#if cardActivity}<path d="m14 6-6 6 6 6"/>{:else}<path d="M19 12H5m6-6-6 6 6 6"/>{/if}
        </svg>
        {#if cardActivity}Back{/if}
      </button>
      {#if cardActivity}
        <button class="brand" aria-label="Capital One home" onclick={onBack}><CapitalOneLogo label="Capital One" /></button>
        <div class="header-links">
          <a href="https://www.capitalone.com/help-center/">Need help?</a>
          {#if profileName}<span class="profile-name">{profileName}</span>{/if}
        </div>
      {:else}
        <div class="view-heading">
          <h1>{title}</h1>
          {#if subtitle}<p>{subtitle}</p>{/if}
        </div>
      {/if}
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
  .card-activity {
    background: var(--dark, #10191f) var(--light, #f2f0f2);
  }
  .card-activity .view-header-inner {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    width: min(1170px, 100%);
    min-height: 74px;
    padding: 10px 24px;
  }
  .card-activity .back-button {
    display: flex;
    justify-content: center;
    gap: 4px;
    width: 102px;
    height: 48px;
    background: transparent;
    border: 2px solid currentColor;
    border-radius: 4px;
  }
  .card-activity .brand { padding: 0; border: 0; background: transparent; color: var(--dark, #e3f2fb) var(--light, #183e5a); }
  .brand :global(svg) { display: block; }
  .header-links { display: flex; justify-content: flex-end; align-items: center; gap: 16px; }
  .header-links a { color: inherit; text-decoration: none; }
  .header-links a:hover { text-decoration: underline; }
  .profile-name { border-left: 1px solid var(--border); padding-left: 16px; }
  .card-activity .view-content { width: 100%; padding: 0; }
  @media (max-width: 570px) {
    .view-header-inner { padding: 12px 14px; }
    .view-content { padding: 18px 14px 40px; }
    .card-activity .view-header-inner { padding-inline: 12px; }
    .card-activity .back-button { width: 72px; height: 40px; }
    .brand :global(svg) { width: 100px; }
    .header-links a { font-size: 13px; }
    .profile-name { display: none; }
  }
</style>
