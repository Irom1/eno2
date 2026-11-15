<script lang="ts">
  let { name = 'right', size = 16 }: { name?: 'right' | 'up' | 'external' | 'check'; size?: number } = $props();
  const paths = {
    right: 'M5 12h14m-6-6 6 6-6 6',
    up: 'M12 19V5m-6 6 6-6 6 6',
    external: 'M7 17 17 7M7 7h10v10',
    check: 'm5 12 4 4L19 6'
  };
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d={paths[name]} />
</svg>

<style>
  svg { display: inline-block; flex: none; vertical-align: -0.15em; }
</style>
