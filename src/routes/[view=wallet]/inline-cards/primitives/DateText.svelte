<script lang="ts">
  import { dateLabel } from '$lib/format.js';
  import { relativeDateLabel } from '$lib/chat/primitives.js';

  interface Props {
    value?: string;
    relative?: boolean;
  }

  let { value, relative = false }: Props = $props();

  const text = $derived(value ? (relative ? relativeDateLabel(value) : dateLabel(value)) : '');
</script>

{#if text}
  <span class="date-text">{text}</span>
{/if}

<style>
  .date-text {
    color: inherit;
    font-size: inherit;
    line-height: inherit;
    white-space: nowrap;
  }
</style>
