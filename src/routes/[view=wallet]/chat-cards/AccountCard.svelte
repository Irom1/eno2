<script lang="ts">
  import { money } from '$lib/format.js';
  import { asRecord } from '$lib/chat/cards.js';
  import ChatCardShell from './ChatCardShell.svelte';

  interface Props {
    payload: unknown;
  }

  let { payload }: Props = $props();

  const data = $derived(asRecord(payload));
  const hasData = $derived(Object.keys(data).length > 0);

  function text(value: unknown): string {
    return value === undefined || value === null ? '' : String(value);
  }

  function num(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function tint(type: unknown): string {
    const value = text(type).toLowerCase();
    if (value.includes('checking')) return 'checking';
    if (value.includes('savings')) return 'savings';
    if (value.includes('credit')) return 'credit';
    return 'other';
  }

  function masked(value: unknown): string {
    const digits = text(value).replace(/\D+/g, '');
    return digits ? `•••• ${digits.slice(-4)}` : 'Account';
  }

  const credit = $derived(text(data.type).toLowerCase().includes('credit'));
</script>

<ChatCardShell title={text(data.nickname) || 'Account'}>
  {#if !hasData}
    <p class="empty">No account details available.</p>
  {:else}
    <div class="hero {tint(data.type)}">
      <div class="hero-top">
        {#if text(data.type)}<span class="hero-type">{text(data.type)}</span>{/if}
        <span class="hero-number">{masked(data.accountNumber)}</span>
      </div>
      <div class="hero-bottom">
        <span class="hero-label">Current balance</span>
        <strong class="hero-balance">{money(data.balance, { decimals: 0 })}</strong>
      </div>
      {#if credit && num(data.rewards) > 0}
        <div class="hero-rewards">{num(data.rewards).toLocaleString()} rewards points</div>
      {/if}
    </div>
  {/if}
</ChatCardShell>

<style>
  .hero {
    border-radius: 13px;
    padding: 13px 14px;
    color: #f5fafc;
    display: grid;
    gap: 14px;
    background: linear-gradient(135deg, #6d4a5c, #3b2733);
  }
  .hero.checking {
    background: linear-gradient(135deg, #47606e, #232f38);
  }
  .hero.savings {
    background: linear-gradient(135deg, #1b506b, #0c2a3a);
  }
  .hero.credit {
    background: linear-gradient(135deg, #9a513c, #5c2a20);
  }
  .hero-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .hero-type {
    font-size: 10.5px;
    font-weight: 600;
    color: #f5fafc;
    padding: 2px 8px;
    border-radius: 999px;
    background: #ffffff24;
    border: 1px solid #ffffff33;
  }
  .hero-number {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    font-size: 11.5px;
    color: #e6f1f6d9;
  }
  .hero-bottom {
    display: grid;
    gap: 1px;
  }
  .hero-label {
    font-size: 11px;
    color: #e6f1f6cc;
  }
  .hero-balance {
    font-size: 22px;
    font-weight: 650;
    letter-spacing: -0.025em;
    font-variant-numeric: tabular-nums;
  }
  .hero-rewards {
    font-size: 11.5px;
    color: #f1e5c4;
    font-weight: 600;
  }
  .empty {
    margin: 0;
    color: var(--muted);
  }
</style>
