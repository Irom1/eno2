<script lang="ts">
  interface Props {
    nickname?: string;
    type?: string;
    masked?: string;
  }

  let { nickname, type, masked }: Props = $props();

  const name = $derived([nickname, type].filter(Boolean).join(' / '));
  const text = $derived(name && masked ? `${name} \u00b7 ${masked}` : name || masked || '');
</script>

{#if text}
  <span class="account-tag">{text}</span>
{/if}

<style>
  .account-tag {
    display: inline-block;
    min-width: 0;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
  }
</style>
