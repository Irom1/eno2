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
- [x] `RewardCard` — one reward balance: label and points from the highest credit-account rewards, or the overview total; no invented dollar value.
- [x] `GoalCard` — one goal projection: target, current, months to target, projected date; no on-track or advice copy.
- [x] `CashflowPointCard` — one complete month: period, inflow, outflow, net; no interpretation.
- [x] `MerchantCard` — one merchant: name, category when present, address (street, city, state) when present; no spend/count, no recommendation.
- [x] `ProfileCard` — one customer from a single-row payload: name and city/state only; no street, zip, contact, or identifier fields.
- [x] Shared `StatusChip` primitive — factual state only, theme-aware, never colour-only.
- [x] Shared `EntityKeyValue` primitive — one compact label/value row, theme-aware and tabular; used by `GoalCard` and `CashflowPointCard` (now accepts optional children so `MoneyText` can supply formatted values).
- [x] Shared primitives library — pure helpers in `src/lib/chat/primitives.ts` and components in `src/routes/[view=wallet]/inline-cards/primitives/`: `MoneyText`/`signedMoney`, `DateText`/`relativeDateLabel`, `AccountTag`, `ProgressMeter`, `ShareBar`, `DeltaBadge`, `Sparkline`, `InlineAction`, `TruncationFooter`, `InlineEmpty`, `ExpandRow`, `DefinitionHint`, and `BufferedPlaceholder`.
  - Used by existing cards: `MoneyText` (`TransactionCard`, `TransactionListCard`, `BillCard`, `LoanCard`, `RecurringChargeCard`, `CashflowPointCard`, `AccountCard`), `DateText` (`TransactionCard`, `TransactionListCard`, `BillCard`, `RecurringChargeCard`), `TruncationFooter` (`TransactionListCard`), `ProgressMeter` (`GoalCard`).
  - Library-only: `AccountTag`, `ShareBar`, `DeltaBadge`, `Sparkline`, `InlineAction`, `InlineEmpty`, `ExpandRow`, `DefinitionHint`, `BufferedPlaceholder`.
- [x] Buffering, markdown-safe anchoring, and deep links — `revealInlineCards`, `inlineBlocks`, `anchorEntityCards`, `transactionHref`, `accountHref`.
- [x] Prompt rules for primitive cards and the single-bill/single-account/single-loan/location/recurring-charge/reward/goal/cashflow/merchant/profile rules.
- [x] `present_card` tool, ownership validation, normalized `card` SSE event, and the `off`/`v2` flag.
  - Server collects turn-local candidates from successful data-tool results, validates account ownership for account/bill/loan/transaction/profile, and emits a whitelisted `EntityCard`.
  - `CARDS_MODE=off` removes the declaration and handling while every existing client-side builder remains the fallback.

- [x] Phase 4 cleanup — legacy registry/relevance coupling removed, follow-ups migrated to `EntityCard`, stale E2E card assertions rewritten.
  - Active app code no longer imports the legacy registry. `src/lib/chat/cards.ts` lives only in `src/lib/chat/archive/legacy-cards/` for the frozen components; shared payload helpers moved to `src/lib/chat/payloads.ts`.
  - Relevance filtering and client-side prose dedupe are gone. `classifyIntents` moved to `src/lib/chat/intents.ts`; suggestions derive from the last assistant message's `inlineCards` (`followUpsFor(EntityCard[], prompt)`).
  - E2E helpers/specs target primitive card selectors (`.loan-card`, `.bill-card`, `.transaction-list-card`, `.pie-chart-card`, `.reward-card`, `.recurring-card`, `.location-card`, `.profile-card`, `.merchant-card`, `.cashflow-card`, `.account-card`, inline `.transaction-card`).
  - Residual limitation: `present_card` supports account, bill, loan, transaction, merchant, location, and profile kinds; the client still infers the remaining kinds (transaction-list, spending-pie, recurring, reward, goal, cashflow). Several primitive library components remain library-only (`AccountTag`, `ShareBar`, `DeltaBadge`, `Sparkline`, `InlineAction`, `InlineEmpty`, `ExpandRow`, `DefinitionHint`, `BufferedPlaceholder`).

## Acceptance for every card slice

Each new primitive must satisfy all of the following before it is checked off. Every shipped slice met them (see final verification below).

- [x] **Primitive only.** One entity or one basic series. No titles, badges, reason tags, rankings, recommendations, combined summaries, or fallback/“everything” cards.
- [x] **Normalized payload.** Whitelisted interface + pure builder in `src/lib/chat/entityCards.ts`; raw tool records never reach the SSE payload or DOM. Missing fields normalize safely; malformed input returns `null`/`[]` instead of throwing.
- [x] **Stable identity and budget.** Stable `entityId`, finite render `id`, turn-level dedupe/replacement, and 1–2 cards per turn. Prefer no card over a broad or wrong one.
- [x] **Inline placement and buffering.** Accept `afterText`; anchor after the named entity where applicable; markdown spans never split; pending reveal waits for the prose; `done` reveals unanchored cards at end-of-text. Non-target cards are untouched by anchoring/merging.
- [x] **Component and renderer.** Standalone card uses `CardFrame` (surface, border, lift shadow — no accent strip; width capped at the chat bubble max of 88% of the assistant content column and left-aligned); add the `kind` branch in `ChatPanel.svelte`; never fold non-transaction cards into the inline transaction bubble. Deep link only when ids are complete; omit otherwise.
- [x] **Prompt.** Add a short intro/takeaway or primitive-card rule only if the card needs framing; every answer keeps one insight and one tip in prose and never restates card values.
- [x] **Tests.** Unit tests for valid/empty/malformed payloads, selection, whitelist, identity, anchoring, and dedupe. Update E2E expectations (do not run Playwright under current policy).
- [x] **Verification.** `npm run check`, `npm test`, and `npm run build` pass. Browser E2E is intentionally skipped. Optionally confirm `/api/health` and `/chat` return 200.
- [x] **Docs.** Update this checklist and the corresponding status/table rows in `CARD_PLAN.md`.

## Final verification

Independent acceptance verification at HEAD `ef0167a` (remote `origin/main` in sync):

- `npm run check` — 0 errors / 0 warnings.
- `npm test` — 303 passed across 32 files.
- `npm run build` — green.
- Runtime smoke: `/api/health`, `/chat`, and `/dashboard` return 200.
- Live SSE for bills and suspicious activity: no `error` events; insight and tip present; client-inferred card fallback works.
- Active `src/` has no legacy cards/relevance/dedupe/`ChatCard`/`chatCardKind` coupling (archive-only).
- E2E spec is type-valid; Playwright was intentionally not run under current policy.

Residual limitations (unchanged):

- `present_card` supports account, bill, loan, transaction, merchant, location, and profile kinds; category, cashflow, recurring, reward, and goal cards remain client-inferred because the tools expose no stable single entity id.
- Several primitive library components remain library-only: `AccountTag`, `ShareBar`, `DeltaBadge`, `Sparkline`, `InlineAction`, `InlineEmpty`, `ExpandRow`, `DefinitionHint`, `BufferedPlaceholder`.
- Data-source gaps: recurring charges carry no cadence or next date, ATMs carry no street address, and locations carry no distance. Cards omit those fields rather than inventing them.
