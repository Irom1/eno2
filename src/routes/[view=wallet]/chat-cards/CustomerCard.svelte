<script lang="ts">
  import { initials } from '$lib/format.js';
  import { asItems } from '$lib/chat/cards.js';
  import ChatCardShell from './ChatCardShell.svelte';

  interface Props {
    payload: unknown;
  }

  let { payload }: Props = $props();

  const items = $derived(asItems(payload));

  function text(value: unknown): string {
    return value === undefined || value === null ? '' : String(value);
  }

  function nameOf(person: Record<string, unknown>): string {
    const name = [text(person.firstName), text(person.lastName)].filter(Boolean).join(' ').trim();
    return name || 'Account holder';
  }

  function addressOf(person: Record<string, unknown>): string {
    const raw = person.address;
    const address =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    return [address.city, address.state].map((part) => text(part)).filter(Boolean).join(', ');
  }
</script>

<ChatCardShell
  title={items.length > 1 ? 'Account holders' : 'Account holder'}
  badge={items.length > 1 ? `${items.length}` : undefined}
>
  {#if items.length === 0}
    <p class="empty">No account holder details to show.</p>
  {:else}
    <ul class="rows">
      {#each items as person, index (text(person._id) || index)}
        <li class="row">
          <span class="avatar" aria-hidden="true">{initials(nameOf(person)) || '?'}</span>
          <span class="row-main">
            <span class="name">{nameOf(person)}</span>
            {#if addressOf(person)}<span class="meta">{addressOf(person)}</span>{/if}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</ChatCardShell>

<style>
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    max-height: 220px;
    overflow-y: auto;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
    min-width: 0;
  }
  .row:last-child {
    border-bottom: none;
  }
  .avatar {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--banner);
    color: var(--link);
    font-size: 11px;
    font-weight: 650;
    flex: none;
  }
  .row-main {
    display: grid;
    gap: 1px;
    min-width: 0;
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
  .empty {
    margin: 0;
    color: var(--muted);
  }
</style>
