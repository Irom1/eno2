<script lang="ts">
  import { money, titleCase } from '$lib/format.js';
  import { asRecord } from './cards.js';
  import ChatCardShell from './ChatCardShell.svelte';

  interface Props {
    payload: unknown;
  }

  let { payload }: Props = $props();

  const data = $derived(asRecord(payload));

  function text(value: unknown): string {
    return value === undefined || value === null ? '' : String(value);
  }

  function num(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function records(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
        )
      : [];
  }

  const categories = $derived(records(data.categories).slice(0, 5));
  const descriptions = $derived(records(data.topDescriptions).slice(0, 5));
  const maxCategory = $derived(
    categories.reduce((max, entry) => Math.max(max, num(entry.total)), 0)
  );
  const total = $derived(num(data.totalSpend));

  function barWidth(entry: Record<string, unknown>): string {
    if (maxCategory <= 0) return '0%';
    return `${Math.max(4, Math.round((num(entry.total) / maxCategory) * 100))}%`;
  }
</script>

<ChatCardShell title="Spending" badge={total > 0 ? money(total, { decimals: 0 }) : undefined}>
  {#if categories.length === 0 && descriptions.length === 0}
    <p class="empty">No spending to show.</p>
  {:else}
    {#if categories.length > 0}
      <ul class="categories">
        {#each categories as entry, index (text(entry.category) || index)}
          <li class="category">
            <div class="category-head">
              <span class="name">{titleCase(text(entry.category) || 'Other')}</span>
              <span class="amount">{money(entry.total, { decimals: 0 })}</span>
            </div>
            <span class="track" aria-hidden="true"><span class="fill" style:width={barWidth(entry)}></span></span>
          </li>
        {/each}
      </ul>
    {/if}

    {#if descriptions.length > 0}
      <p class="section-label">Top places</p>
      <ul class="descriptions">
        {#each descriptions as entry, index (text(entry.description) || index)}
          <li class="description">
            <span class="desc-name">{text(entry.description) || 'Purchase'}</span>
            <span class="desc-value">{money(entry.total, { decimals: 0 })}</span>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</ChatCardShell>

<style>
  .categories {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 7px;
  }
  .category {
    display: grid;
    gap: 3px;
  }
  .category-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .name {
    font-weight: 600;
  }
  .amount {
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .track {
    display: block;
    height: 4px;
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
  .section-label {
    margin: 11px 0 5px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
  }
  .descriptions {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    max-height: 160px;
    overflow-y: auto;
  }
  .description {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }
  .description:last-child {
    border-bottom: none;
  }
  .desc-name {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .desc-value {
    flex: none;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .empty {
    margin: 0;
    color: var(--muted);
  }
</style>
