<script lang="ts">
  interface Props {
    more: number;
    label?: string;
  }

  let { more, label }: Props = $props();

  const count = $derived(Number.isFinite(more) ? Math.floor(more) : 0);
</script>

{#if count > 0}
  <p class="truncation-footer">{count} {label ?? 'more'}</p>
{/if}

<style>
  .truncation-footer {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
  }
</style>
