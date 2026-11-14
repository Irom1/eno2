<script lang="ts">
  import { clampPercent } from '$lib/chat/primitives.js';

  interface Props {
    value: number;
    max: number;
    label?: string;
  }

  let { value, max, label }: Props = $props();

  const safeMax = $derived(Number.isFinite(max) && max > 0 ? max : 100);
  const current = $derived(
    Math.min(Math.max(0, Number.isFinite(value) ? value : 0), safeMax)
  );
  const width = $derived(clampPercent((current / safeMax) * 100));
</script>

<div class="progress-meter">
  {#if label}
    <span class="label">{label}</span>
  {/if}
  <div
    class="track"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax={safeMax}
    aria-valuenow={current}
    aria-label={label ?? 'Progress'}
  >
    <span class="fill" style:width={`${width}%`}></span>
  </div>
</div>

<style>
  .progress-meter {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .label {
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
  }
  .track {
    width: 100%;
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ink) 10%, var(--border));
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: color-mix(in srgb, var(--link) 82%, var(--border));
  }
</style>
