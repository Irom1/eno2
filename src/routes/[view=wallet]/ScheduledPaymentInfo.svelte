<script lang="ts">
  let { text }: { text: string } = $props();

  const id = $props.id();
  let container: HTMLSpanElement;
  let hovered = $state(false);
  let pinned = $state(false);
  let open = $derived(hovered || pinned);

  function close() {
    hovered = false;
    pinned = false;
  }

  function toggle() {
    if (pinned) close();
    else pinned = true;
  }
</script>

<svelte:window
  onclick={(event) => {
    if (open && event.target instanceof Node && !container.contains(event.target)) close();
  }}
  onkeydown={(event) => {
    if (event.key === 'Escape') close();
  }}
/>

<span
  class="payment-info"
  role="group"
  bind:this={container}
  onpointerenter={(event) => { if (event.pointerType === 'mouse') hovered = true; }}
  onpointerleave={() => { hovered = false; }}
>
  <button
    type="button"
    aria-label="Scheduled payments"
    aria-controls={id}
    aria-expanded={open}
    onclick={toggle}
  >
    <span class="info-icon" aria-hidden="true">i</span>
  </button>
  <span class="payment-note" {id} hidden={!open}>{text}</span>
</span>

<style>
  .payment-info { position: relative; display: inline-flex; flex: none; }

  button {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    font-family: inherit;
    cursor: pointer;
  }

  .info-icon {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    width: 14px;
    height: 14px;
    border: 1px solid color-mix(in srgb, currentColor 65%, transparent);
    border-radius: 50%;
    font-size: 10px;
    font-weight: 650;
    line-height: 1;
  }

  button:hover .info-icon, button[aria-expanded='true'] .info-icon {
    border-color: currentColor;
    background: color-mix(in srgb, currentColor 12%, transparent);
  }

  button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }

  .payment-note {
    position: absolute;
    inset-block-start: 100%;
    inset-inline-end: 0;
    z-index: 2;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow);
    text-align: start;
    white-space: nowrap;
  }
</style>
