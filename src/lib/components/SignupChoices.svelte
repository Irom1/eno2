<script lang="ts">
  import ActionIcon from '$lib/components/ActionIcon.svelte';
  import { products } from '$lib/products';
  import { brandedCardName, categoryLabels, type DemoCard, type SpendingCategory } from '$lib/spending';
  import type { AccountSelection } from '$lib/signup';
  interface Props {
    step: 'spending' | 'accounts';
    categories?: SpendingCategory[];
    selection?: AccountSelection;
    card?: DemoCard | null;
    disabled?: boolean;
    oncontinue: () => void;
  }
  let { step, categories = $bindable([]), selection = $bindable({ checking: true, savings: true, creditCard: true }), card = null, disabled = false, oncontinue }: Props = $props();
  const cardProduct = $derived(products[card?.id ?? 'quicksilver']);

  function toggleCategory(category: SpendingCategory, checked: boolean) {
    categories = checked ? [...categories, category] : categories.filter((item) => item !== category);
  }
</script>

<div class="choices">
  {#if step === 'spending'}
    <fieldset disabled={disabled} aria-label="Top spending categories">
      <legend>Your spending favorites</legend>
      <p class="hint">Pick as many as you like. Your first pick is your top priority.</p>
      {#each Object.entries(categoryLabels) as [key, label]}
        {@const category = key as SpendingCategory}
        <label class:selected={categories.includes(category)}>
          <input type="checkbox" checked={categories.includes(category)} onchange={(event) => toggleCategory(category, event.currentTarget.checked)} />
          <span>{label}</span>{#if categories.includes(category)}<small aria-hidden="true">#{categories.indexOf(category) + 1}</small>{/if}
        </label>
      {/each}
    </fieldset>
  {:else}
    <fieldset disabled={disabled} aria-label="Choose accounts">
      <label class="product" style:--product-gradient={products.checking.gradient} style:--product-ink={products.checking.ink}>
        <input type="checkbox" bind:checked={selection.checking} />
        <span>{products.checking.name}<small>For everyday spending</small></span>
      </label>
      <label class="product" style:--product-gradient={products.savings.gradient} style:--product-ink={products.savings.ink}>
        <input type="checkbox" bind:checked={selection.savings} />
        <span>{products.savings.name}<small>For your next goal</small></span>
      </label>
      <label class="product" style:--product-gradient={cardProduct.gradient} style:--product-ink={cardProduct.ink}>
        <input type="checkbox" bind:checked={selection.creditCard} />
        <span>{brandedCardName(card)} credit card<small>{card?.reason ?? 'An all-around match for everyday spending.'}</small></span>
      </label>
    </fieldset>
    {#if card}<a class="product-link" href={card.url} target="_blank" rel="noreferrer">About {brandedCardName(card)} <ActionIcon name="external" size={14} /></a>{/if}
  {/if}
  <button class="setup-action" type="button" aria-label={step === 'spending' ? 'Confirm spending categories' : 'Confirm selected accounts'} disabled={disabled || (step === 'spending' && !categories.length)} onclick={oncontinue}>Continue <ActionIcon /></button>
</div>

<style>
  .choices { margin-top: 18px; min-width: min(340px, 100%); }
  fieldset { min-width: 0; padding: 0; margin: 0; border: 0; }
  legend { padding: 0; font-size: 13px; font-weight: 650; }
  .hint { margin: 8px 0 12px; color: var(--muted); font-size: 11px; line-height: 1.6; }
  label { display: flex; align-items: center; gap: 12px; padding: 12px; margin-top: 7px; border: 1px solid var(--border); border-radius: 10px; background: transparent; cursor: pointer; }
  label:hover, label.selected { border-color: color-mix(in srgb, var(--link) 60%, var(--border)); background: var(--reply); }
  input { flex: none; width: 18px; height: 18px; margin: 0; cursor: pointer; }
  label > span { flex: 1; min-width: 0; font-size: 13px; line-height: 1.5; }
  small { display: block; color: var(--muted); font-size: 10px; }
  label.product { color: var(--product-ink); background: var(--product-gradient); }
  label.product:hover { border-color: currentColor; }
  .product small { color: inherit; }
  fieldset:disabled label { opacity: .6; cursor: default; }
  .product-link { display: inline-block; margin-top: 12px; color: var(--link); font-size: 11px; text-underline-offset: 3px; }
  :is(input, button, a):focus-visible { outline: 2px solid var(--link); outline-offset: 3px; }
</style>
