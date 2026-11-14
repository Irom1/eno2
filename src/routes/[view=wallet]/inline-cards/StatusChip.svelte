<script lang="ts">
  import { titleCase } from '$lib/format.js';

  interface Props {
    status: string;
  }

  let { status }: Props = $props();

  const label = $derived(titleCase(status.trim()));
</script>

{#if label}
  <span class="status-chip" data-status={status.trim().toLowerCase()}>{label}</span>
{/if}

<style>
  .status-chip {
    display: inline-flex;
    align-items: center;
    flex: none;
    padding: 2px 7px;
    border: 1px solid color-mix(in srgb, var(--ink) 22%, var(--border));
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 70%, var(--page));
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 650;
    line-height: 1.4;
    letter-spacing: 0.01em;
    white-space: nowrap;
  }
</style>
