<script lang="ts">
  import type { Snippet } from 'svelte';
  import OpenIcon from '../OpenIcon.svelte';

  interface Props {
    href: string;
    label: string;
    external?: boolean;
    children?: Snippet;
  }

  let { href, label, external = false, children }: Props = $props();
</script>

{#snippet body()}
  <span class="label">
    {#if children}
      {@render children()}
    {:else}
      {label}
    {/if}
  </span>
  {#if external}
    <OpenIcon />
  {/if}
{/snippet}

{#if external}
  <a class="inline-action" {href} aria-label={label} target="_blank" rel="noopener noreferrer">
    {@render body()}
  </a>
{:else}
  <a class="inline-action" {href} aria-label={label}>
    {@render body()}
  </a>
{/if}

<style>
  .inline-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--link);
    font-size: 12.5px;
    font-weight: 650;
    line-height: 1.35;
    text-decoration: none;
  }
  .inline-action:hover .label,
  .inline-action:focus-visible .label {
    text-decoration: underline;
  }
  .label {
    min-width: 0;
    overflow-wrap: anywhere;
  }
</style>
