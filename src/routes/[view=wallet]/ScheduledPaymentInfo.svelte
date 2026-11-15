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
    <span aria-hidden="true">i</span>
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
    border: 1px solid currentColor;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  button:hover, button[aria-expanded='true'] {
    background: color-mix(in srgb, currentColor 14%, transparent);
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
