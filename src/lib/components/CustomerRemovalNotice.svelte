<script lang="ts">
  import type { RemovedCustomer } from '$lib/customerRemoval';
  let { removed, error = '', busy = false, onundo }: { removed: RemovedCustomer | null; error?: string; busy?: boolean; onundo: () => void } = $props();
</script>
{#if error}<p class="removal-error" role="alert">{error}</p>{/if}
{#if removed}<div class="removal-notice" role="status"><span>{removed.name} removed from the demo.</span><button type="button" disabled={busy} onclick={onundo}>Undo</button></div>{/if}
<style>
  .removal-notice { display: flex; align-items: center; gap: 12px; padding: 10px; margin-top: 6px; border-top: 1px solid var(--border); color: var(--muted); font-size: 11px; line-height: 1.5; }
  .removal-notice span { flex: 1; }
  button { padding: 5px; border: 0; background: transparent; color: var(--link, var(--brand)); font: inherit; text-decoration: underline; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  .removal-error { margin: 0; padding: 10px; color: var(--muted); font-size: 12px; }
</style>
