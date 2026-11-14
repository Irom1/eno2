# Inline entity cards

This plan has moved. The canonical, maintained inventory and roadmap are in [`CARD_PLAN.md`](../../CARD_PLAN.md) at the repository root.

Quick status:

- Phase 0 shipped: legacy broad cards are archived under `src/lib/chat/archive/legacy-cards/`; chat is prose-first.
- Phase 2 partial: `TransactionCard`, `TransactionListCard`, and the primitive spending pie chart (`PieChartCard`, `spending-pie`) are implemented. `SpendingCategoryCard` is represented by the pie (latest complete month, top 5 categories plus `Other`, period plus percentage legend).
- Next: `BillCard` and `AccountCard`, then the remaining planned primitives.

Design principle: cards are primitive data displays. The AI carries the insight, ranking, comparison, recommendation, and tip in prose. See `CARD_PLAN.md` for the full principle, card catalog, component inventory, data model, migration phases, tests, and file map.
