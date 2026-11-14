# Legacy chat cards (frozen)

These Svelte components are **frozen and archived** as of commit `chore: archive legacy chat cards and plan inline entity cards`. They are no longer imported or rendered anywhere in the application.

## Why they were retired

The legacy card system rendered one broad card per tool result. It dumped entire tool payloads (often lists of accounts, transactions, or bills) instead of the single entity the assistant was actually talking about. It also relied on a fallback/"covers every outcome" card and repeated redundant titles and counts already present in the prose. As a result the chat produced noisy, imprecise cards that did not express *which* entity the assistant meant.

## Status

- **Do not import these files** and do not add them to new work.
- They are kept only for historical reference and for comparison while migrating.
- The directory is excluded from the app build graph; it has no active callers.

## Replacement

Inline, single-entity cards are specified in [`docs/plans/inline-entity-cards.md`](../../../../../docs/plans/inline-entity-cards.md). The new system places at most one or two precise entity cards between prose segments, inferred or explicitly selected from the user's question and the assistant's references.

## Data/registry

The existing card data layer (`src/lib/chat/cards.ts`, relevance, dedupe, and follow-ups) is **temporarily retained** so follow-ups and the future migration keep working. It is scheduled for removal/rework in Phase 4 of the plan.
