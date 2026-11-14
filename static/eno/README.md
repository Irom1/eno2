# Eno logo assets

Two 1000 × 1000 transparent PNGs of Eno, the Capital One assistant mascot. The
file name describes the mode the logo is used in.

| Mode | Artwork | File |
| --- | --- | --- |
| Light | Navy body | `eno_logo_light.png` |
| Dark | Light blue body | `eno_logo_dark.png` |

## Palette

- Light-blue body: `#89bde2`
- Navy body: `#043d58`
- Smile: `#d45858` (light-blue) / `#cc2424` (navy)
- Background: transparent

## Variant mapping

The artwork is chosen for contrast against its surface:

- `light` is the **navy** artwork, used on **light** surfaces (light mode).
- `dark` is the **light-blue** artwork, used on **dark** surfaces (dark mode).

In the wallet page this is:

```svelte
<Eno variant={isDark ? 'dark' : 'light'} size={96} />
```

## Usage

Via the reusable component:

```svelte
<script lang="ts">
  import Eno from '$lib/components/Eno.svelte';
</script>

<Eno variant="light" size={96} />
```

Or directly with an `<img>`:

```svelte
<img src="/eno/eno_logo_light.png" alt="" width="96" height="96" />
```

Use `alt=""` (or the component's `alt` prop) when the mascot is decorative.

## Thinking animation

While the assistant is working, `EnoThinking.svelte` renders a single logo with
a subtle breathing pulse (a 1.8s `translateY`/`scale` loop). There is no frame
swapping, so the image never flickers. Both logos are preloaded once on mount so
theme switches never flash a blank image.

Users who prefer reduced motion see the static logo with no animation.
