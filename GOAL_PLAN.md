# GOAL_PLAN — Eno 2.0 primitive chat cards

Implementation checklist for the active goal: ship small, primitive, inline chat cards that show data while the prose carries insight, comparison, and advice.

Canonical design, inventory, and detailed acceptance live in [`CARD_PLAN.md`](./CARD_PLAN.md). If the two disagree, `CARD_PLAN.md` wins.

## Shipped

- [x] Phase 0: legacy broad cards archived; chat is prose-first. No app import of `src/lib/chat/archive/legacy-cards/`.
- [x] `TransactionCard` — one merchant/date/amount for anomaly findings; 1–2 per turn; no reason chip; deep link when ids exist.
- [x] `TransactionListCard` — merged deposit/withdrawal list, cap 8 plus “N more”; every row deep-links; standalone `CardFrame`.
- [x] `SpendingPieCard` — latest complete month, top 5 plus `Other`, period and legend; no editorial labels.
- [x] `BillCard` — one largest upcoming bill from `insight_upcoming_bills`; payee, due date, amount, factual status chip; optional account link; coverage/total stay in prose.
- [x] `AccountCard` — exactly one account (single-row payload only); nickname, type, masked number, balance, rewards when positive; whole card deep-links; never an account list.
- [x] `LoanCard` — one loan: type/description, balance, monthly payment, factual status chip; optional account link; no credit score.
- [x] `LocationCard` — one ATM or branch: name, street address when the data has one, hours when present; no distance.
- [x] `RecurringChargeCard` — one recurring charge: description, average amount, months seen, last date; no invented cadence or next date.
- [x] Shared `StatusChip` primitive — factual state only, theme-aware, never colour-only.
- [x] Buffering, markdown-safe anchoring, and deep links — `revealInlineCards`, `inlineBlocks`, `anchorEntityCards`, `transactionHref`, `accountHref`.
- [x] Prompt rules for primitive cards and the single-bill/single-account/single-loan/location/recurring-charge rules.

## Remaining

- [ ] `RewardCard` — one reward balance or offer: label, points, optional value.
- [ ] `GoalCard` — one goal: label, target, current, projected date.
- [ ] `CashflowPointCard` — one month/point: period, inflow, outflow.
- [ ] `MerchantCard` — one merchant: name, amount, count.
- [ ] `ProfileCard` — one customer: name and optional safe contact fields only, no sensitive identifiers.
- [ ] Shared primitives still planned in `CARD_PLAN.md` §6: `DateLabel`/`RelativeDate`, `AccountTag`, `EntityKeyValue`, `ProgressMeter`, `ShareBar`, `DeltaBadge`, `Sparkline`, `InlineAction`, `TruncationFooter`, `InlineEmpty`, `ExpandRow`, `DefinitionHint`, `BufferedPlaceholder` (plus promoting `Money`/`SignedAmount`).
- [ ] `present_card` tool, ownership validation, normalized `card` SSE event, and the `off`/`v2` flag.
- [ ] Phase 4 cleanup: remove legacy registry/relevance coupling, migrate follow-ups to `EntityCard`, rewrite stale E2E card assertions.

## Acceptance for every card slice

Each new primitive must satisfy all of the following before it is checked off:

- [ ] **Primitive only.** One entity or one basic series. No titles, badges, reason tags, rankings, recommendations, combined summaries, or fallback/“everything” cards.
- [ ] **Normalized payload.** Whitelisted interface + pure builder in `src/lib/chat/entityCards.ts`; raw tool records never reach the SSE payload or DOM. Missing fields normalize safely; malformed input returns `null`/`[]` instead of throwing.
- [ ] **Stable identity and budget.** Stable `entityId`, finite render `id`, turn-level dedupe/replacement, and 1–2 cards per turn. Prefer no card over a broad or wrong one.
- [ ] **Inline placement and buffering.** Accept `afterText`; anchor after the named entity where applicable; markdown spans never split; pending reveal waits for the prose; `done` reveals unanchored cards at end-of-text. Non-target cards are untouched by anchoring/merging.
- [ ] **Component and renderer.** Standalone card uses `CardFrame`; add the `kind` branch in `ChatPanel.svelte`; never fold non-transaction cards into the inline transaction bubble. Deep link only when ids are complete; omit otherwise.
- [ ] **Prompt.** Add a short intro/takeaway or primitive-card rule only if the card needs framing; every answer keeps one insight and one tip in prose and never restates card values.
- [ ] **Tests.** Unit tests for valid/empty/malformed payloads, selection, whitelist, identity, anchoring, and dedupe. Update E2E expectations (do not run Playwright under current policy).
- [ ] **Verification.** `npm run check`, `npm test`, and `npm run build` pass. Browser E2E is intentionally skipped. Optionally confirm `/api/health` and `/chat` return 200.
- [ ] **Docs.** Update this checklist and the corresponding status/table rows in `CARD_PLAN.md`.
