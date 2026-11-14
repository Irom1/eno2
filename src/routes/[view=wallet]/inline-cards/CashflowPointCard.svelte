<script lang="ts">
  import { money } from '$lib/format.js';
  import type { CashflowPointEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';
  import EntityKeyValue from './EntityKeyValue.svelte';

  interface Props {
    card: CashflowPointEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const inflowText = $derived(money(payload.inflow, { decimals: 2 }));
  const outflowText = $derived(money(payload.outflow, { decimals: 2 }));
  const netText = $derived(
    payload.net > 0
      ? `+${money(payload.net, { decimals: 2 })}`
      : payload.net < 0
        ? `\u2212${money(Math.abs(payload.net), { decimals: 2 })}`
        : money(0, { decimals: 2 })
  );
  const label = $derived(`${payload.period} cashflow`);
</script>

<CardFrame {label}>
  <div class="cashflow-card" data-kind="cashflow">
    <EntityKeyValue label="Period" value={payload.period} />
    <EntityKeyValue label="Inflow" value={inflowText} />
    <EntityKeyValue label="Outflow" value={outflowText} />
    <EntityKeyValue label="Net" value={netText} />
  </div>
</CardFrame>

<style>
  .cashflow-card {
    min-width: 0;
  }
</style>
