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

The legacy registry (`cards.ts`), including `ChatCard`/`ChatCardKind`, `chatCardKind`, `transactionKind`, the `asItems`/`asRecord` helpers, and the labels, now lives **in this archive directory** (`src/lib/chat/archive/legacy-cards/cards.ts`). The frozen components import it relatively (`./cards.js`).

It is **archive-only**. Active app code does not import it:
- Shared payload helpers used by active code moved to `src/lib/chat/payloads.ts`.
- Intent classification moved to `src/lib/chat/intents.ts` without card-relevance filtering.
- Follow-ups consume normalized `EntityCard` values from `src/lib/chat/entityCards.ts`.
- Client-side prose dedupe and relevance filtering were removed; prompt-level rules and primitive builders replaced them.

Do not add new imports of this registry.
