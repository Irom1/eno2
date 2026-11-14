<script lang="ts">
  import { money } from '$lib/format.js';
  import { signedMoney } from '$lib/chat/primitives.js';

  interface Props {
    amount: number | null;
    signed?: boolean;
    decimals?: number;
    class?: string;
  }

  let { amount, signed = false, decimals = 2, class: className }: Props = $props();

  const text = $derived(
    amount === null || amount === undefined
      ? ''
      : signed
        ? signedMoney(amount, decimals)
        : money(amount, { decimals })
  );
</script>

{#if text}
  <span class={`money-text${className ? ` ${className}` : ''}`}>{text}</span>
{/if}

<style>
  .money-text {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>
