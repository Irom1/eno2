<script lang="ts">
  import { initials } from '$lib/format.js';
  import type { ProfileEntityCard } from '$lib/chat/entityCards.js';
  import CardFrame from './CardFrame.svelte';

  interface Props {
    card: ProfileEntityCard;
  }

  let { card }: Props = $props();

  const payload = $derived(card.payload);
  const avatar = $derived(initials(payload.name));
  const label = $derived(`Profile, ${payload.name}`);
</script>

<CardFrame {label}>
  <div class="profile-card" data-kind="profile">
    {#if avatar}
      <span class="avatar" aria-hidden="true">{avatar}</span>
    {/if}
    <div class="profile-text">
      <div class="name">{payload.name}</div>
      {#if payload.location}
        <div class="location">{payload.location}</div>
      {/if}
    </div>
  </div>
</CardFrame>

<style>
  .profile-card {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .avatar {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--link) 14%, var(--surface));
    color: var(--ink);
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0.02em;
  }
  .profile-text {
    min-width: 0;
  }
  .name {
    font-size: 13.5px;
    font-weight: 650;
    line-height: 1.35;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .location {
    margin-top: 3px;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
</style>
