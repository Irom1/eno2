<script lang="ts">
  let { onclick }: { onclick: () => void } = $props();
</script>

<button type="button" aria-label="Read Eno message aloud" title="Read aloud" {onclick}>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m11 5-6 4H2v6h3l6 4V5Z" />
    <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
  </svg>
</button>

<style>
  button { display: grid; place-items: center; padding: 1px; border: 0; background: transparent; color: var(--muted); cursor: pointer; }
  button:hover { color: var(--link); }
  button:focus-visible { outline: 2px solid var(--link); outline-offset: 3px; }
  svg { width: 13px; height: 13px; }
</style>
