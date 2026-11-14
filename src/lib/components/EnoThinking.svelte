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

  // Preload every pose for both variants once on mount. This keeps frame and
  // theme switches instant instead of flashing an empty image while the new
  // source decodes.
  $effect(() => {
    if (typeof window === 'undefined') return;
    const variants: EnoVariant[] = ['light', 'navy'];
    for (const name of variants) {
      for (const item of ENO_FRAMES) {
        const preload = new Image();
        preload.src = enoSrc(name, item.pose);
      }
    }
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
  <img
    src={enoSrc(variant, ENO_FRAMES[frame].pose)}
    alt=""
    width={size}
    height={size}
    loading="eager"
    decoding="async"
    draggable="false"
    data-frame={frame}
    data-pose={ENO_FRAMES[frame].pose}
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
</style>
