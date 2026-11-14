<script lang="ts">
  import { clamp, money } from '$lib/format.js';
  import { asRecord } from './cards.js';
  import ChatCardShell from './ChatCardShell.svelte';

  interface Props {
    payload: unknown;
  }

  let { payload }: Props = $props();

  const data = $derived(asRecord(payload));

  function num(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const target = $derived(num(data.targetAmount));
  const current = $derived(num(data.currentBalance));
  const net = $derived(num(data.monthlyNet));
  const months = $derived(
    typeof data.monthsToTarget === 'number' ? data.monthsToTarget : null
  );
  const progress = $derived(target > 0 ? clamp(current / target, 0, 1) : 0);
  const hasData = $derived(target > 0 || current > 0);

  function timeline(): string {
    if (months === null) return 'No timeline yet';
    if (months <= 0) return 'Target reached';
    return `About ${months} month${months === 1 ? '' : 's'} to target`;
  }
</script>

<ChatCardShell title="Goal" badge={months !== null && months > 0 ? `${months} mo` : undefined}>
  {#if !hasData}
    <p class="empty">No goal details to show.</p>
  {:else}
    <div class="progress-head">
      <span class="current">{money(current, { decimals: 0 })}</span>
      <span class="target">of {money(target, { decimals: 0 })}</span>
    </div>
    <span class="track" aria-hidden="true">
      <span class="fill" style:width={`${Math.round(progress * 100)}%`}></span>
    </span>
    <div class="facts">
      <div class="fact">
        <span class="label">Monthly net</span>
        <strong>{money(net, { decimals: 0 })}</strong>
      </div>
      <div class="fact">
        <span class="label">Timeline</span>
        <strong>{timeline()}</strong>
      </div>
    </div>
    <p class="track-text" class:on={Boolean(data.onTrack)}>
      {#if months === 0}
        You have reached this goal.
      {:else if data.onTrack}
        On track for your target.
      {:else}
        Not on track yet — the monthly net is what is moving the balance.
      {/if}
    </p>
  {/if}
</ChatCardShell>

<style>
  .progress-head {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 6px;
  }
  .current {
    font-size: 18px;
    font-weight: 650;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .target {
    color: var(--muted);
    font-size: 11.5px;
  }
  .track {
    display: block;
    height: 6px;
    border-radius: 999px;
    background: var(--border);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--link);
  }
  .facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: 10px;
  }
  .fact {
    display: grid;
    gap: 1px;
    padding: 7px 9px;
    border-radius: 10px;
    background: var(--banner);
  }
  .label {
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 600;
  }
  .fact strong {
    font-size: 12.5px;
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .track-text {
    margin: 9px 0 0;
    color: var(--muted);
    font-size: 11.5px;
  }
  .track-text.on {
    color: #2f8a5e;
  }
  .empty {
    margin: 0;
    color: var(--muted);
  }
</style>
