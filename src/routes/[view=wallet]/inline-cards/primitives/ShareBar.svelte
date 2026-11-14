<script lang="ts">
  import { clampPercent } from '$lib/chat/primitives.js';

  interface Props {
    share: number;
    label?: string;
  }

  let { share, label }: Props = $props();

  const percent = $derived(clampPercent((Number.isFinite(share) ? share : 0) * 100));
  const percentText = $derived(`${Math.round(percent)}%`);
</script>

<div class="share-bar">
  <span class="track" aria-hidden="true">
    <span class="fill" style:width={`${percent}%`}></span>
  </span>
  {#if label}
    <span class="label">{label}</span>
  {/if}
  <span class="visually-hidden">{percentText}</span>
</div>

<style>
  .share-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .track {
    flex: 1;
    min-width: 0;
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ink) 10%, var(--border));
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: color-mix(in srgb, var(--link) 70%, var(--border));
  }
  .label {
    flex: none;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
