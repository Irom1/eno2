<script lang="ts">
  import { money } from '$lib/format.js';
  import type { PieSlice, SpendingPieEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';

  interface Props {
    card: SpendingPieEntityCard;
  }

  let { card }: Props = $props();

  const PALETTE = ['#2f7d95', '#d1902f', '#6f9a62', '#b45d74', '#6c74b8', '#7b8794'];
  const GAP_DEGREES = 1.5;

  const slices = $derived(card.payload.slices ?? []);
  const period = $derived(card.payload.period);

  interface Wedge {
    slice: PieSlice;
    color: string;
    path: string;
  }

  function polar(radius: number, degrees: number): [number, number] {
    const radians = (degrees * Math.PI) / 180;
    return [50 + radius * Math.cos(radians), 50 + radius * Math.sin(radians)];
  }

  function wedgePath(startDegrees: number, sweepDegrees: number): string {
    const start = polar(42, startDegrees);
    const end = polar(42, startDegrees + sweepDegrees);
    const largeArc = sweepDegrees > 180 ? 1 : 0;
    return `M 50 50 L ${start[0].toFixed(3)} ${start[1].toFixed(3)} A 42 42 0 ${largeArc} 1 ${end[0].toFixed(3)} ${end[1].toFixed(3)} Z`;
  }

  const wedges = $derived.by<Wedge[]>(() => {
    const list = slices;
    if (list.length === 0) return [];
    if (list.length === 1) return [];
    const gap = GAP_DEGREES;
    let cursor = -90;
    return list.map((slice, index) => {
      const sweep = slice.share * 360;
      const start = cursor + gap / 2;
      const usable = Math.max(sweep - gap, 0.01);
      cursor += sweep;
      return {
        slice,
        color: PALETTE[index % PALETTE.length],
        path: wedgePath(start, usable)
      };
    });
  });

  const isFullCircle = $derived(slices.length === 1);
  const ariaLabel = $derived(
    `Spending by category for ${period}: ${slices
      .map((slice) => `${slice.label} ${Math.round(slice.share * 100)} percent`)
      .join(', ')}.`
  );
</script>

{#if slices.length > 0}
  <CardFrame>
    <div class="pie-chart-card" data-kind="spending-pie">
      <div class="pie-plot">
        <svg viewBox="0 0 100 100" role="img" aria-label={ariaLabel}>
          {#if isFullCircle}
            <circle class="pie-slice" cx="50" cy="50" r="42" fill={PALETTE[0]} />
          {:else}
            {#each wedges as wedge (wedge.slice.label)}
              <path class="pie-slice" d={wedge.path} fill={wedge.color} />
            {/each}
          {/if}
        </svg>
      </div>
      <div class="legend">
        <p class="period">{period}</p>
        <ul class="legend-rows">
          {#each slices as slice, index (slice.label)}
            <li class="legend-row">
              <span
                class="legend-swatch"
                style:background-color={PALETTE[index % PALETTE.length]}
                aria-hidden="true"
              ></span>
              <span class="legend-label">{slice.label}</span>
              <span class="legend-share">{Math.round(slice.share * 100)}%</span>
              <span class="legend-amount">{money(slice.amount, { decimals: 0 })}</span>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  </CardFrame>
{/if}

<style>
  .pie-chart-card {
    display: flex;
    align-items: center;
    gap: 18px;
    min-width: 0;
  }
  .pie-plot {
    flex: none;
    width: 132px;
    max-width: 45%;
  }
  .pie-plot svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .pie-slice {
    stroke: var(--surface);
    stroke-width: 0.8;
    stroke-linejoin: round;
  }
  .legend {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 6px;
  }
  .period {
    margin: 0;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
  }
  .legend-rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 5px;
  }
  .legend-row {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 12.5px;
    line-height: 1.35;
  }
  .legend-swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex: none;
  }
  .legend-label {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--ink);
  }
  .legend-share {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
  .legend-amount {
    color: var(--ink);
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
  @media (max-width: 520px) {
    .pie-chart-card {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }
    .pie-plot {
      align-self: center;
      width: 140px;
      max-width: 60%;
    }
  }
</style>
