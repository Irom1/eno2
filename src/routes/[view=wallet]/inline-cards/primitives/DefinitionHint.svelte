<script lang="ts">
  interface Props {
    term: string;
    definition: string;
  }

  let { term, definition }: Props = $props();
</script>

<details class="definition-hint">
  <summary>{term}</summary>
  {#if definition}
    <p>{definition}</p>
  {/if}
</details>

<style>
  .definition-hint {
    min-width: 0;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
  }
  summary {
    cursor: pointer;
    text-decoration: underline dotted;
    text-underline-offset: 2px;
  }
  p {
    margin: 4px 0 0;
  }
</style>
