<script lang="ts">
  interface Props {
    label: string;
    value: string;
  }

  let { label, value }: Props = $props();
</script>

<div class="entity-key-value">
  <span class="key">{label}</span>
  <span class="value">{value}</span>
</div>

<style>
  .entity-key-value {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    padding: 4px 0;
    border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }
  .entity-key-value:first-child {
    border-top: 0;
    padding-top: 0;
  }
  .key {
    flex: none;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
  }
  .value {
    min-width: 0;
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 650;
    line-height: 1.35;
    text-align: right;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
</style>
