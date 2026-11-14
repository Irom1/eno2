<script lang="ts">
  import { dateLabel, money } from '$lib/format.js';
  import { asRecord } from './cards.js';
  import ChatCardShell from './ChatCardShell.svelte';

  interface Props {
    payload: unknown;
  }

  let { payload }: Props = $props();

  const CAP = 5;
  const data = $derived(asRecord(payload));
  const findings = $derived(
    Array.isArray(data.findings)
      ? (data.findings as unknown[]).filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
        )
      : []
  );
  const items = $derived(findings.slice(0, CAP));
  const more = $derived(Math.max(0, findings.length - CAP));

  function text(value: unknown): string {
    return value === undefined || value === null ? '' : String(value);
  }

  function productLabel(value: unknown): string {
    return text(value).toLowerCase() === 'duplicate' ? 'Possible duplicate' : 'Unusual amount';
  }
</script>

<ChatCardShell>
  {#if items.length === 0}
    <p class="empty">Nothing unusual right now.</p>
  {:else}
    <ul class="rows">
      {#each items as finding, index (text(finding.date) + text(finding.description) || index)}
        <li class="row">
          <span class="row-main">
            <span class="tag">{productLabel(finding.type)}</span>
            <span class="name">{text(finding.description) || 'Recent charge'}</span>
            <span class="meta">{text(finding.date) ? dateLabel(text(finding.date)) : ''}</span>
          </span>
          <span class="amount">{money(finding.amount, { decimals: 0 })}</span>
        </li>
      {/each}
    </ul>
    {#if more > 0}
      <p class="more">{more} more</p>
    {/if}
  {/if}
</ChatCardShell>

<style>
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    max-height: 240px;
    overflow-y: auto;
  }
  .row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 0;
    border-bottom: 1px solid var(--border);
    min-width: 0;
  }
  .row:last-child {
    border-bottom: none;
  }
  .row-main {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .tag {
    width: fit-content;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--banner);
    color: var(--muted);
    font-size: 10px;
    font-weight: 600;
  }
  .name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    color: var(--muted);
    font-size: 11px;
  }
  .amount {
    flex: none;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .more {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 11px;
  }
  .empty {
    margin: 0;
    color: var(--muted);
  }
</style>
