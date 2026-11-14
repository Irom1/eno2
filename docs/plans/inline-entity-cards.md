# Inline entity cards

This plan has moved. The canonical, maintained inventory and roadmap are in [`CARD_PLAN.md`](../../CARD_PLAN.md) at the repository root.

Quick status:

- All planned phases are shipped: legacy broad cards are archived under `src/lib/chat/archive/legacy-cards/`, the primitive inline cards and shared primitives are implemented, `present_card` is live behind `CARDS_MODE=off|v2`, and Phase 4 cleanup is complete.
- Next: none.
- Canonical source: [`CARD_PLAN.md`](../../CARD_PLAN.md) at the repository root, with acceptance evidence in [`GOAL_PLAN.md`](../../GOAL_PLAN.md).

Design principle: cards are primitive data displays. The AI carries the insight, ranking, comparison, recommendation, and tip in prose. See `CARD_PLAN.md` for the full principle, card catalog, component inventory, data model, migration phases, tests, and file map.
