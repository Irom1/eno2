<script lang="ts">
  import { accountHref, type RewardEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';
  import OpenIcon from './OpenIcon.svelte';

  interface Props {
    card: RewardEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const pointsText = $derived(`${payload.points.toLocaleString('en-US')} pts`);
  const href = $derived(accountHref(payload.customerId, payload.accountId));
  const label = $derived(`${payload.label}, ${pointsText}`);
</script>

{#snippet content(linked: boolean)}
  <div class="reward-head">
    <span class="reward-label">{payload.label}</span>
    {#if linked}
      <OpenIcon />
    {/if}
  </div>
  <div class="reward-points">{pointsText}</div>
{/snippet}

<CardFrame {label}>
  <div class="reward-card" data-kind="reward">
    {#if href}
      <a
        class="reward-link"
        {href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${payload.label} rewards in your account`}
      >
        {@render content(true)}
      </a>
    {:else}
      {@render content(false)}
    {/if}
  </div>
</CardFrame>

<style>
  .reward-card {
    min-width: 0;
  }
  .reward-link {
    display: block;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }
  .reward-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }
  .reward-label {
    font-size: 13.5px;
    font-weight: 650;
    line-height: 1.35;
    color: var(--ink);
    overflow-wrap: anywhere;
    transition: color 140ms ease;
  }
  a.reward-link:hover .reward-label,
  a.reward-link:focus-visible .reward-label {
    color: var(--link);
  }
  .reward-points {
    margin-top: 8px;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.3;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>
