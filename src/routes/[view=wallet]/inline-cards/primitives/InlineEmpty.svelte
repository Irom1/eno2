<script lang="ts">
  interface Props {
    message: string;
  }

  let { message }: Props = $props();
</script>

{#if message}
  <p class="inline-empty">{message}</p>
{/if}

<style>
  .inline-empty {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.35;
  }
</style>
