<script lang="ts">
  import { onDestroy } from 'svelte';
  import { accountWheelPosition } from '$lib/accountWheelGesture';
  import { goto } from '$app/navigation';
  import { orderCustomers } from '$lib/customerSelection';
  interface Customer { id: string; firstName: string; lastName: string; city?: string; state?: string }
  let { customers, loading, error, onretry, onclose }: {
    customers: Customer[]; loading: boolean; error: boolean; onretry: () => void; onclose: () => void;
  } = $props();
  const ordered = $derived(orderCustomers(customers));
  let wheel = $state<HTMLDivElement>();
  $effect(() => { wheel?.focus({ preventScroll: true }); });
  let position = $state(0);
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(settleTimer));
  let touchStartY: number | null = null;
  const index = $derived(Math.max(0, Math.min(ordered.length - 1, Math.round(position))));
  const selected = $derived(ordered[index]);
  const name = (customer: Customer) => `${customer.firstName} ${customer.lastName}`.trim() || 'Account';

  function select(next: number) {
    clearTimeout(settleTimer);
    const target = Math.max(0, Math.min(ordered.length - 1, next));
    wheel?.scrollTo({ top: target * 76, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  function continueToAccount() {
    if (selected) void goto(`/dashboard?customer=${encodeURIComponent(selected.id)}`);
  }
  function stageKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !(event.target instanceof Element && event.target.closest('a, button'))) {
      event.preventDefault();
      continueToAccount();
    }
  }
  function scrollAccounts(event: WheelEvent) {
    if (!ordered.length || !wheel || event.ctrlKey) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 228 : 1);
    clearTimeout(settleTimer);
    // Follow every input event directly. Snap only once the user stops moving.
    const top = accountWheelPosition(wheel.scrollTop, delta, ordered.length);
    wheel.scrollTo({ top, behavior: 'instant' });
    position = top / 76;
    settleTimer = setTimeout(() => select(Math.round(position)), 160);
  }
  function touchstart(event: TouchEvent) {
    touchStartY = event.touches[0]?.clientY ?? null;
  }
  function touchmove(event: TouchEvent) {
    if (touchStartY === null || !ordered.length) return;
    const y = event.touches[0]?.clientY;
    if (y === undefined) return;
    const delta = touchStartY - y;
    if (Math.abs(delta) >= 36) { select(index + Math.sign(delta)); touchStartY = y; }
  }
  function keydown(event: KeyboardEvent) {
    const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: ordered.length - 1 }[event.key];
    if (next !== undefined) { event.preventDefault(); event.stopPropagation(); select(next); }
  }
</script>

<svelte:window onkeydown={stageKeydown} />

<!-- The whole stage is the wheel's gesture surface; the listbox exposes keyboard semantics. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="account-stage" id="account-list" onwheel={scrollAccounts} ontouchstart={touchstart} ontouchmove={touchmove} ontouchend={() => { touchStartY = null; }} ontouchcancel={() => { touchStartY = null; }}>
  <button class="back" onclick={onclose}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m10 3-5 5 5 5" /></svg> Back</button>
  <div class="picker-content">
    <h2>Hey, who’s there?</h2>
    {#if loading}
      <div class="message" role="status">Finding your people<span class="dots">…</span></div>
    {:else if error}
      <div class="message" role="status"><p>We couldn’t load your accounts.</p><button class="retry" onclick={onretry}>Try again</button></div>
    {:else if !ordered.length}
      <div class="message"><p>No accounts here just yet.</p><a class="continue" href="/setup?start=signup">Open your first account </a></div>
    {:else}
      <div class="wheel-frame">
        <div class="selection-line" aria-hidden="true"></div>
        <div class="wheel" bind:this={wheel} role="listbox" tabindex="0" aria-label="Choose your account"
          aria-activedescendant={selected ? `wheel-${selected.id}` : undefined} onkeydown={keydown}
          onscroll={() => { if (wheel) position = wheel.scrollTop / 76; }}>
          {#each ordered as customer, i (customer.id)}
            <div role="option" id={`wheel-${customer.id}`} aria-selected={i === index} tabindex="-1"
              class="account-option" style:--distance={Math.min(Math.abs(i - position), 2)}
              onclick={() => select(i)} onkeydown={(event) => { if (event.key === ' ') { event.preventDefault(); select(i); } else keydown(event); }}>
              {name(customer)}
            </div>
          {/each}
        </div>
      </div>
      <div class="selection-detail" aria-live="polite">
        <span class="initials" aria-hidden="true">{selected?.firstName[0]}{selected?.lastName[0]}</span>
        <span>{selected?.city ? `${selected.city}${selected.state ? `, ${selected.state}` : ''}` : 'Your everyday, all in one place.'}</span>
        <span class="counter">{String(index + 1).padStart(2, '0')} / {String(ordered.length).padStart(2, '0')}</span>
      </div>
      <a class="continue" href={`/dashboard?customer=${encodeURIComponent(selected.id)}`} aria-label={`Continue as ${name(selected)}`}>
        Let’s go
      </a>
    {/if}
  </div>
</div>

<style>
  .account-stage { position: absolute; inset: 0; z-index: 3; color: #f7ffe8; display: grid; place-items: center; padding: 76px 24px; touch-action: pan-x; box-sizing: border-box; animation: arrive 650ms 220ms both; }
  .back { position: absolute; top: 28px; left: 32px; display: flex; gap: 12px; align-items: center; padding: 10px 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
  .picker-content { width: min(100%, 560px); }
  h2 { font-size: clamp(36px, 5vw, 60px); line-height: 1.06; letter-spacing: -.055em; font-weight: 650; margin: 0 0 12px; }
  .wheel-frame { position: relative; margin-inline: auto; width: 100%; }
  .wheel { height: 228px; overflow-y: auto; overscroll-behavior: contain; scroll-snap-type: none; scrollbar-width: none; padding-block: 76px; box-sizing: border-box; mask-image: linear-gradient(transparent, black 34%, black 66%, transparent); }
  .wheel::-webkit-scrollbar { display: none; }
  .selection-line { position: absolute; inset: 76px 0; border-block: 1px solid #edffd24d; display: flex; justify-content: space-between; align-items: center; color: #e5ffc1; font-size: 23px; pointer-events: none; }
  .account-option { height: 76px; display: flex; align-items: center; justify-content: center; padding-inline: 30px; box-sizing: border-box; scroll-snap-align: center; cursor: pointer; font-size: clamp(25px, 4vw, 43px); font-weight: 600; letter-spacing: -.045em; transform: scale(calc(1 - var(--distance) * .12)); opacity: calc(1 - var(--distance) * .3); overflow-wrap: anywhere; line-height: 1.05; }
  .selection-detail { min-height: 34px; margin: 4px auto 24px; display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 12px; }
  .initials { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; border: 1px solid #e6ffcb66; font-size: 10px; }
  .counter { margin-left: 8px; font-size: 10px; font-variant-numeric: tabular-nums; opacity: .7; }
  .continue { display: flex; align-items: center; justify-content: center; gap: 32px; width: min(100%, 280px); box-sizing: border-box; margin-inline: auto; padding: 17px 22px; border-radius: 100px; background: #efffcf; color: #203d28; text-decoration: none; font-size: 18px; font-weight: 650; transition: transform 180ms, background 180ms; }
  .continue:hover { transform: translateY(-3px); background: #fffce8; }
  .message { min-height: 270px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .retry { padding: 12px 24px; border: 1px solid currentColor; border-radius: 30px; color: inherit; background: transparent; cursor: pointer; font: inherit; }
  a:focus-visible, button:focus-visible, .wheel:focus-visible { outline: 2px solid #fffce8; outline-offset: 5px; }
  @keyframes arrive { from { opacity: 0; translate: 0 22px; } to { opacity: 1; translate: 0 0; } }
  @media (max-width: 690px) { .account-stage { padding: 76px 20px; } .back { left: 24px; top: 18px; } }
  @media (prefers-reduced-motion: reduce) { .account-stage { animation: none; } .continue { transition: none; } }
</style>
