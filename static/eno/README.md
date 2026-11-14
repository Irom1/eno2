# Eno mascot assets

Six 1000 × 1000 transparent PNGs of Eno, the Capital One assistant mascot.

| Variant | Pose | File |
| --- | --- | --- |
| Light blue | Wave — right arm raised | `eno-light-wave.png` |
| Light blue | Open — right arm extended | `eno-light-open.png` |
| Light blue | Reach — right arm mid-raised | `eno-light-reach.png` |
| Navy | Wave — right arm raised | `eno-navy-wave.png` |
| Navy | Open — right arm extended | `eno-navy-open.png` |
| Navy | Reach — right arm mid-raised | `eno-navy-reach.png` |

## Palette

- Light blue body: `#89bde2`
- Navy body: `#043d58`
- Smile: `#d45858` (light) / `#cc2424` (navy)
- Background: transparent

## Usage

Via the reusable component:

```svelte
<script lang="ts">
  import Eno from '$lib/components/Eno.svelte';
</script>

<Eno variant="light" pose="wave" size={96} />
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

The short middle frame keeps the loop lively without being distracting. Users
who prefer reduced motion see only the static first frame (`wave`), with no
bobbing or crossfade.

