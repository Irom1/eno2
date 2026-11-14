<script lang="ts">
  interface Props {
    suggestions: string[];
    disabled?: boolean;
    onSelect: (prompt: string) => void;
  }

  let { suggestions, disabled = false, onSelect }: Props = $props();
</script>

{#if suggestions.length > 0}
  <div class="follow-ups" aria-label="Suggested follow-ups">
    {#each suggestions as suggestion (suggestion)}
      <button
        class="follow-up"
        type="button"
        {disabled}
        onclick={() => onSelect(suggestion)}
      >
        {suggestion}
      </button>
    {/each}
  </div>
{/if}

<style>
  .follow-ups {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .follow-up {
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink);
    padding: 6px 11px;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.3;
    text-align: left;
    cursor: pointer;
    transition: border-color 120ms ease, background-color 120ms ease;
  }
  .follow-up:hover:not(:disabled) {
    border-color: var(--link);
  }
  .follow-up:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 1px;
  }
  .follow-up:disabled {
    opacity: 0.55;
    cursor: default;
  }
  @media (max-width: 480px) {
    .follow-ups {
      gap: 5px;
    }
    .follow-up {
      padding: 5px 10px;
      font-size: 11.5px;
    }
  }
</style>
