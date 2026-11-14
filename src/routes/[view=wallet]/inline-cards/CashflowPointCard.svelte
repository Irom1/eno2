<script lang="ts">
  import type { CashflowPointEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';
  import EntityKeyValue from './EntityKeyValue.svelte';
  import MoneyText from './primitives/MoneyText.svelte';

  interface Props {
    card: CashflowPointEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const label = $derived(`${payload.period} cashflow`);
</script>

<CardFrame {label}>
  <div class="cashflow-card" data-kind="cashflow">
    <EntityKeyValue label="Period" value={payload.period} />
    <EntityKeyValue label="Inflow">
      <MoneyText amount={payload.inflow} decimals={2} />
    </EntityKeyValue>
    <EntityKeyValue label="Outflow">
      <MoneyText amount={payload.outflow} decimals={2} />
    </EntityKeyValue>
    <EntityKeyValue label="Net">
      <MoneyText amount={payload.net} decimals={2} signed />
    </EntityKeyValue>
  </div>
</CardFrame>

<style>
  .cashflow-card {
    min-width: 0;
  }
</style>
