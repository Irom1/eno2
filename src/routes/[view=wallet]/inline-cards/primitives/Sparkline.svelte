<script lang="ts">
  import { sparklinePoints } from '$lib/chat/primitives.js';

  interface Props {
    values: number[];
    label?: string;
  }

  let { values, label }: Props = $props();

  const points = $derived(sparklinePoints(values));
</script>

{#if points}
  <svg
    class="sparkline"
    viewBox="0 0 100 28"
    preserveAspectRatio="none"
    role="img"
    aria-label={label ?? 'Sparkline'}
  >
    <polyline
      points={points}
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
{/if}

<style>
  .sparkline {
    display: block;
    width: 100%;
    height: 28px;
    color: color-mix(in srgb, var(--link) 82%, var(--border));
  }
</style>
