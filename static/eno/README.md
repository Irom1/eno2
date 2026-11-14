# Eno mascot assets

Six 1000 × 1000 transparent PNGs of Eno, the Capital One assistant mascot.

| Variant | Artwork | Intended surface | Pose | File |
| --- | --- | --- | --- | --- |
| `light` | Light blue body | Dark mode / dark surfaces | Wave — right arm raised | `eno-light-wave.png` |
| `light` | Light blue body | Dark mode / dark surfaces | Open — right arm extended | `eno-light-open.png` |
| `light` | Light blue body | Dark mode / dark surfaces | Reach — right arm mid-raised | `eno-light-reach.png` |
| `navy` | Navy body | Light mode / light surfaces | Wave — right arm raised | `eno-navy-wave.png` |
| `navy` | Navy body | Light mode / light surfaces | Open — right arm extended | `eno-navy-open.png` |
| `navy` | Navy body | Light mode / light surfaces | Reach — right arm mid-raised | `eno-navy-reach.png` |

## Palette

- Light blue body: `#89bde2`
- Navy body: `#043d58`
- Smile: `#d45858` (light) / `#cc2424` (navy)
- Background: transparent

## Variant mapping

The artwork is chosen for contrast against its surface:

- `light` is the **light-blue** artwork, used on **dark** surfaces (dark mode).
- `navy` is the **navy** artwork, used on **light** surfaces (light mode).

In the wallet page this is:

```svelte
<Eno variant={isDark ? 'light' : 'navy'} pose="wave" size={96} />
```

## Usage

Via the reusable component:

```svelte
<script lang="ts">
  import Eno from '$lib/components/Eno.svelte';
</script>

<Eno variant="navy" pose="wave" size={96} />
```

Or directly with an `<img>`:

```svelte
<img src="/eno/eno-navy-open.png" alt="" width="96" height="96" />
```

Use `alt=""` (or the component's `alt` prop) when the mascot is decorative.

## Thinking animation

While the assistant is working, `EnoThinking.svelte` cycles through the three
poses in this order:

1. `wave` — 520ms
2. `open` — 160ms (brief intermediate)
3. `reach` — 520ms

The short middle frame keeps the loop lively without being distracting. The
component renders a single image and swaps its source instantly (no crossfade
or bob), and preloads both variants so theme and pose changes never flash a
blank frame.

Users who prefer reduced motion see only the static first frame (`wave`), with
no cycling.
