<script lang="ts">
  import { enoSrc, type EnoVariant } from '$lib/eno.js';

  interface Props {
    variant?: EnoVariant;
    size?: number;
    alt?: string;
    class?: string;
  }

  let {
    variant = 'light',
    size = 160,
    alt = 'Eno, the Capital One assistant',
    class: className = ''
  }: Props = $props();

  const src = $derived(enoSrc(variant));
</script>

<img
  {src}
  {alt}
  width={size}
  height={size}
  class={className}
  draggable="false"
  decoding="async"
/>
