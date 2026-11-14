<script lang="ts">
  import { deltaDirection, signedMoney } from '$lib/chat/primitives.js';

  interface Props {
    delta: number;
    pct?: number;
    suffix?: string;
  }

  let { delta, pct, suffix }: Props = $props();

  const direction = $derived(deltaDirection(delta));
  const directionWord = $derived(
    direction === 'up' ? 'up' : direction === 'down' ? 'down' : 'flat'
  );
  const arrow = $derived(direction === 'up' ? '\u25b2' : direction === 'down' ? '\u25bc' : '\u2013');
  const amountText = $derived(signedMoney(delta));
  const percentText = $derived(
    pct === undefined || !Number.isFinite(pct)
      ? ''
      : `${pct > 0 ? '+' : pct < 0 ? '\u2212' : ''}${Math.abs(pct).toFixed(1)}%`
  );
</script>

<span class="delta-badge" data-direction={direction}>
  <span class="arrow" aria-hidden="true">{arrow}</span>
  <span class="amount">{amountText}</span>
  {#if percentText}
    <span class="percent">{percentText}</span>
  {/if}
  {#if suffix}
    <span class="suffix">{suffix}</span>
  {/if}
  <span class="visually-hidden">{directionWord}</span>
</span>

<style>
  .delta-badge {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    color: var(--ink);
    font-size: 12.5px;
    line-height: 1.35;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .arrow {
    color: var(--muted);
    font-size: 10px;
  }
  .amount {
    font-weight: 650;
  }
  .percent,
  .suffix {
    color: var(--muted);
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
