<script lang="ts">
  import { enoSrc, type EnoPose, type EnoVariant } from '$lib/eno.js';

  interface Props {
    variant?: EnoVariant;
    pose?: EnoPose;
    size?: number;
    alt?: string;
    class?: string;
  }

  let {
    variant = 'light',
    pose = 'wave',
    size = 160,
    alt = 'Eno, the Capital One assistant',
    class: className = ''
  }: Props = $props();

  const src = $derived(enoSrc(variant, pose));
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
