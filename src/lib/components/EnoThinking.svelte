<script lang="ts">
  import { enoSrc, type EnoVariant } from '$lib/eno.js';

  interface Props {
    active?: boolean;
    variant?: EnoVariant;
    size?: number;
  }

  let { active = false, variant = 'light', size = 40 }: Props = $props();

  // Preload both logos once on mount so theme switches never flash a blank
  // image while the new source decodes.
  $effect(() => {
    if (typeof window === 'undefined') return;
    const variants: EnoVariant[] = ['light', 'dark'];
    for (const name of variants) {
      const preload = new Image();
      preload.src = enoSrc(name);
    }
  });
</script>

<div
  class="eno-thinking"
  class:thinking={active}
  data-active={active}
  aria-hidden="true"
  style:width="{size}px"
  style:height="{size}px"
>
  <img
    src={enoSrc(variant)}
    alt=""
    width={size}
    height={size}
    loading="eager"
    decoding="async"
    draggable="false"
  />
</div>

<style>
  .eno-thinking {
    display: inline-block;
    flex: none;
    vertical-align: middle;
  }
  .eno-thinking img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .eno-thinking.thinking img {
    animation: eno-pulse 1.8s ease-in-out infinite;
    transform-origin: 50% 60%;
  }
  @keyframes eno-pulse {
    0%,
    100% {
      transform: translateY(0) scale(1);
    }
    50% {
      transform: translateY(-2px) scale(1.03);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .eno-thinking.thinking img {
      animation: none;
      transform: none;
    }
  }
</style>
