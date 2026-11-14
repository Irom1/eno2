<script lang="ts">
  import { addressSearchText, type AddressCandidate } from '$lib/address';

  interface Props {
    query: string;
    context: { city?: string; state?: string; zip?: string };
    disabled?: boolean;
    open?: boolean;
    activeId?: string;
    onselect: (candidate: AddressCandidate) => void;
  }
  let { query, context, disabled = false, open = $bindable(false), activeId = $bindable<string | undefined>(), onselect }: Props = $props();
  let suggestions = $state<AddressCandidate[]>([]);
  let loading = $state(false);
  let error = $state('');
  let active = $state(-1);
  let dismissed = $state('');
  let searched = $state(false);

  $effect(() => {
    const term = addressSearchText(query);
    const searchContext = { city: context.city, state: context.state, zip: context.zip };
    suggestions = []; open = false; active = -1; activeId = undefined; error = ''; loading = false; searched = false;
    if (!term || disabled || term === dismissed) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      loading = true;
      try {
        const response = await fetch('/api/addresses/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: term, context: searchContext }), signal: controller.signal });
        const result = await response.json() as { suggestions?: AddressCandidate[]; error?: string };
        if (!response.ok) throw new Error(result.error || 'Address suggestions are unavailable.');
        if (controller.signal.aborted) return;
        suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
        searched = true;
        open = suggestions.length > 0;
      } catch (cause) {
        if (!controller.signal.aborted) error = cause instanceof Error ? cause.message : 'Address suggestions are unavailable.';
      } finally { if (!controller.signal.aborted) loading = false; }
    }, 600);
    return () => { clearTimeout(timer); controller.abort(); };
  });

  function select(candidate: AddressCandidate) { dismissed = addressSearchText(query); open = false; activeId = undefined; onselect(candidate); }
  export function handleKeydown(event: KeyboardEvent) {
    if (!open || event.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); dismissed = addressSearchText(query); open = false; activeId = undefined; }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = event.key === 'ArrowDown' ? (active + 1) % suggestions.length : (active <= 0 ? suggestions.length : active) - 1;
      activeId = `address-option-${active}`;
    } else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); event.stopPropagation(); select(suggestions[active]); }
  }
</script>

{#if open}
  <div class="address-popup">
    <p class="popup-title">Choose your address</p>
    <div id="address-suggestions" role="listbox" aria-label="Address suggestions">
      {#each suggestions as candidate, index (candidate.id)}
        <button id={`address-option-${index}`} type="button" role="option" aria-selected={active === index} onmousedown={(event) => event.preventDefault()} onclick={() => select(candidate)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg><span>{candidate.label}</span>
        </button>
      {/each}
    </div>
    <p class="attribution">Address data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p>
  </div>
{:else if loading || error}
  <div class="lookup-status" role="status">{loading ? 'Looking up addresses…' : error}</div>
{:else if searched && !suggestions.length}
  <div class="lookup-status" role="status">No matching suggestions yet. Keep typing the street and city, or send your full address to Eno.</div>
{/if}

<style>
  .address-popup, .lookup-status { position: absolute; z-index: 10; bottom: calc(100% + 10px); inset-inline: 0; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); color: var(--ink); box-shadow: 0 10px 30px #102b4220; overflow: hidden; }
  .popup-title { margin: 0; padding: 10px 16px; color: var(--muted); font-size: 11px; font-weight: 600; border-bottom: 1px solid var(--border); }
  [role='listbox'] { max-height: min(290px, 38dvh); overflow-y: auto; padding: 5px; }
  button { display: flex; align-items: center; gap: 12px; width: 100%; border: 0; border-radius: 10px; padding: 11px; background: transparent; color: inherit; font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
  button:hover, button[aria-selected='true'] { background: var(--reply); }
  button:focus-visible { outline: 2px solid var(--link); outline-offset: -2px; }
  svg { flex: none; width: 18px; height: 18px; color: var(--link); }
  span { min-width: 0; overflow-wrap: anywhere; }
  .attribution { margin: 0; padding: 7px 16px; border-top: 1px solid var(--border); color: var(--muted); font-size: 9px; }
  .attribution a { color: inherit; text-underline-offset: 2px; }
  .lookup-status { padding: 10px 16px; font-size: 12px; color: var(--muted); }
</style>
