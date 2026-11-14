<script lang="ts">
  // External-link affordance for transaction deep links.
</script>

<svg
  class="open-icon"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M14 4h6v6" />
  <path d="M20 4 11 13" />
  <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
</svg>

<style>
  .open-icon {
    width: 14px;
    height: 14px;
    flex: none;
    color: var(--muted);
    transition: color 140ms ease;
  }
  :global(a:hover) .open-icon,
  :global(a:focus-visible) .open-icon {
    color: var(--link);
  }
</style>
