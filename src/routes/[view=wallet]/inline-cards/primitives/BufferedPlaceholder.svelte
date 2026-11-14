<script lang="ts">
  interface Props {
    label?: string;
  }

  let { label }: Props = $props();
</script>

<div class="buffered-placeholder" aria-hidden="true">
  <span class="skeleton title"></span>
  <span class="skeleton meta"></span>
</div>
<span class="visually-hidden">{label ?? 'Loading card'}</span>

<style>
  .buffered-placeholder {
    display: grid;
    gap: 6px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--ink) 14%, var(--border));
    border-radius: 14px;
    background: color-mix(in srgb, var(--surface) 60%, transparent);
  }
  .skeleton {
    display: block;
    height: 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ink) 8%, var(--border));
  }
  .title {
    width: 56%;
  }
  .meta {
    width: 34%;
    height: 8px;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
