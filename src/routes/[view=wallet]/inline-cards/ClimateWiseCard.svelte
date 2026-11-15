<script lang="ts">
  import { customerHref } from '$lib/customerSelection';
  import { SCORE_MAX, scoreFraction } from '$lib/climate/emissions';
  import type { ClimateWiseEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';

  interface Props {
    card: ClimateWiseEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const href = $derived(customerHref('/climatewise', payload.customerId ?? null));
  const pct = $derived(scoreFraction(payload.score) * 100);
  const kgText = $derived(
    payload.totalKg.toLocaleString('en-US', { maximumFractionDigits: 1 })
  );
  const label = $derived(
    `ClimateWise score ${payload.score} out of ${SCORE_MAX}, ${payload.tier}, ${kgText} kg CO2e over the last ${payload.days} days`
  );
</script>

<CardFrame {label}>
  <div class="climatewise-card" data-kind="climatewise">
    <div class="climate-score">
      <span class="climate-value">{payload.score}</span>
      <span class="climate-tier">{payload.tier}</span>
    </div>
    <div class="climate-gauge" aria-hidden="true">
      <span class="climate-fill" style:width={`${pct}%`}></span>
    </div>
    <p class="climate-total">
      <span class="climate-kg">{kgText} kg CO₂e</span>
      <span class="climate-window">over the last {payload.days} days</span>
    </p>
    <a class="climate-link" {href} target="_blank" rel="noopener noreferrer">
      View ClimateWise details
    </a>
  </div>
</CardFrame>

<style>
  .climatewise-card {
    min-width: 0;
  }
  .climate-score {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .climate-value {
    font-size: 28px;
    font-weight: 700;
    line-height: 1.1;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .climate-tier {
    font-size: 13px;
    font-weight: 650;
    line-height: 1.35;
    color: var(--muted);
  }
  .climate-gauge {
    margin-top: 8px;
    width: 100%;
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ink) 10%, var(--border));
  }
  .climate-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: color-mix(in srgb, var(--link) 82%, var(--border));
  }
  .climate-total {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    margin: 8px 0 0;
    font-size: 13px;
    line-height: 1.35;
    color: var(--muted);
  }
  .climate-kg {
    font-weight: 650;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .climate-link {
    display: inline-block;
    margin-top: 8px;
    font-size: 12.5px;
    font-weight: 600;
    line-height: 1.35;
    color: var(--link);
    text-decoration: none;
  }
  .climate-link:hover,
  .climate-link:focus-visible {
    text-decoration: underline;
  }
</style>
