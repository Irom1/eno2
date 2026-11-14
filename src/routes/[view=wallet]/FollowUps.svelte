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
      <button class="follow-up" type="button" {disabled} onclick={() => onSelect(suggestion)}>
        <span class="follow-up-label">{suggestion}</span>
        <svg
          class="follow-up-arrow"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h14m-6-6 6 6-6 6" />
        </svg>
      </button>
    {/each}
  </div>
{/if}

<style>
  .follow-ups {
    display: grid;
    gap: 0;
    margin: 0;
  }
  .follow-up {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    padding: 7px 2px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--ink);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.3;
    text-align: left;
    cursor: pointer;
  }
  .follow-up + .follow-up {
    border-top: 1px solid var(--border);
  }
  .follow-up-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .follow-up-arrow {
    width: 14px;
    height: 14px;
    flex: none;
    color: var(--link);
    transition: transform 140ms ease;
  }
  .follow-up:hover:not(:disabled) {
    color: var(--link);
  }
  .follow-up:hover:not(:disabled) .follow-up-arrow {
    transform: translateX(3px);
  }
  .follow-up:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 1px;
  }
  .follow-up:disabled {
    opacity: 0.55;
    cursor: default;
  }
  @media (prefers-reduced-motion: reduce) {
    .follow-up-arrow {
      transition: none;
    }
    .follow-up:hover:not(:disabled) .follow-up-arrow {
      transform: none;
    }
  }
</style>
