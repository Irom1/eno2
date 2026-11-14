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
        <svg
          class="follow-up-elbow"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M6 4v7a5 5 0 0 0 5 5h8" />
          <path d="m15 12 4 4-4 4" />
        </svg>
        <span class="follow-up-label">{suggestion}</span>
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
    justify-content: flex-start;
    gap: 8px;
    width: 100%;
    padding: 7px 6px;
    box-sizing: border-box;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ink);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.3;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition:
      background-color 140ms ease,
      color 140ms ease;
  }
  .follow-up-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .follow-up-elbow {
    width: 15px;
    height: 15px;
    flex: none;
    color: var(--link);
  }
  .follow-up:hover:not(:disabled),
  .follow-up:focus-visible {
    background: color-mix(in srgb, var(--link) 10%, transparent);
    color: var(--link);
    text-decoration: none;
  }
  .follow-up:focus-visible {
    outline: 2px solid var(--link);
    outline-offset: 1px;
  }
  .follow-up:disabled {
    opacity: 0.55;
    cursor: default;
    background: transparent;
  }
  @media (prefers-reduced-motion: reduce) {
    .follow-up {
      transition: none;
    }
  }
</style>
