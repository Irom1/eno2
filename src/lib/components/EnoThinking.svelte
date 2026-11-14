<script lang="ts">
  import {
    ENO_FRAMES,
    enoSrc,
    nextEnoFrame,
    type EnoVariant
  } from '$lib/eno.js';

  interface Props {
    active?: boolean;
    variant?: EnoVariant;
    size?: number;
  }

  let { active = false, variant = 'light', size = 40 }: Props = $props();

  let frame = $state(0);
  let reducedMotion = $state(false);

  // Client-only: track the user's motion preference, including live changes.
  $effect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = query.matches;
    const onChange = (event: MediaQueryListEvent): void => {
      reducedMotion = event.matches;
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  });

  // Advance through the frames while thinking. The index is a local variable so
  // writing `frame` never re-triggers this effect.
  $effect(() => {
    if (!active || reducedMotion) {
      frame = 0;
      return;
    }

    let index = 0;
    let timer: ReturnType<typeof setTimeout>;
    frame = index;

    const schedule = (): void => {
      timer = setTimeout(() => {
        index = nextEnoFrame(index);
        frame = index;
        schedule();
      }, ENO_FRAMES[index].duration);
    };
    schedule();

    return () => clearTimeout(timer);
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
  {#each ENO_FRAMES as item, index (item.pose)}
    <img
      src={enoSrc(variant, item.pose)}
      alt=""
      width={size}
      height={size}
      draggable="false"
      decoding="async"
      data-frame={index}
      data-pose={item.pose}
      data-visible={index === frame ? 'true' : 'false'}
    />
  {/each}
</div>

<style>
  .eno-thinking {
    position: relative;
    display: inline-block;
    flex: none;
    vertical-align: middle;
  }
  .eno-thinking.thinking {
    animation: eno-bob 1.6s ease-in-out infinite;
  }
  .eno-thinking img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    opacity: 0;
    transition: opacity 80ms linear;
  }
  .eno-thinking img[data-visible='true'] {
    opacity: 1;
  }
  @keyframes eno-bob {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-2px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .eno-thinking.thinking {
      animation: none;
    }
    .eno-thinking img {
      transition: none;
    }
  }
</style>
