# GOAL_PLAN — Eno 2.0 primitive chat cards

Implementation checklist for the active goal: ship small, primitive, inline chat cards that show data while the prose carries insight, comparison, and advice.

Canonical design, inventory, and detailed acceptance live in [`CARD_PLAN.md`](./CARD_PLAN.md). If the two disagree, `CARD_PLAN.md` wins.

## Shipped

- [x] Phase 0: legacy broad cards archived; chat is prose-first. No app import of `src/lib/chat/archive/legacy-cards/`.
- [x] `TransactionCard` — one merchant/date/amount per anomaly finding (one inline card each, capped at 8 per turn); no reason chip; deep link when ids exist. The previous 1–2 cap was a layout budget, not a limit on flagged findings.
- [x] `TransactionListCard` — merged deposit/withdrawal list, cap 8 plus “N more”; every row deep-links; standalone `CardFrame`.
- [x] `SpendingPieCard` — latest complete month, top 5 plus `Other`, period and legend; no editorial labels.
- [x] Filtered/ranked transaction lists — `insight_top_transactions` (category and/or merchant filter, largest first) feeds the existing transaction list card, and raw deposit/withdrawal list cards are gated to recent/all-transaction prompts so a ranked question never shows an unrelated feed.
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
- [x] Buffering, markdown-safe anchoring, deep links, and inline grouping — `revealInlineCards`, `inlineBlocks`, `groupInlineCards` (`src/lib/chat/cardGroups.ts`), `anchorEntityCards`, `transactionHref`, `accountHref`. Single-entity cards render inside `.bubble.assistant`; `transaction-list`/`spending-pie` stay standalone.
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
- [x] **Stable identity and budget.** Stable `entityId`, finite render `id`, turn-level dedupe/replacement. Anomaly findings get one inline card each (cap 8); other cards remain at 1–2 per turn. The previous 1–2 cap was a layout budget, not a limit on flagged findings. Prefer no card over a broad or wrong one.
- [x] **Inline placement and buffering.** Accept `afterText`; anchor after the named entity where applicable; markdown spans never split; pending reveal waits for the prose; `done` reveals unanchored cards at end-of-text. Non-target cards are untouched by anchoring/merging.
- [x] **Component and renderer.** Every card uses `CardFrame`; single-entity cards (`transaction`, `bill`, `account`, `loan`, `location` branches, `recurring`, `reward`, `goal`, `cashflow`, `merchant`, `profile`) render inline inside the assistant bubble (bubble-scoped CSS: 1px border, no lift shadow, no accent, width capped by the bubble), while `transaction-list`, `spending-pie` and the ATM locator (`location` with `payload.type === 'atm'`) stay standalone framed cards (surface, border, lift shadow — no accent strip; width capped at 88% of the assistant content column and left-aligned). The ATM locator is a deliberate single-entity exception because of its map plus external actions. `ChatCardView.svelte` centralizes the `kind` switch and `groupInlineCards` flushes/emits standalone cards in order using `isInlineCard`. Deep link only when ids are complete; omit otherwise.
- [x] **ATM locator.** ATM results (`find_nearby_atms`) carry geocoded lat/lng and no street address; they render a standalone `AtmLocatorCard` (`.atm-locator-card`, name/hours/distance plus a server-proxied Mapbox Static Images `<img>`, grouped as a `card` rather than inline in the prose bubble), while branches keep an inline `LocationCard` (`.location-card`, address). The map card has no buttons: below it, outside the card surface and the bubble, `.atm-actions` holds explicit “Open in Apple Maps”/“Open in Google Maps” links in two equal columns matching the card’s 88% width, so each button is about half the card width (text-only, no icons, at least 44px tall, with a link-tinted background/border/shadow highlight on hover/focus instead of an underline; no OpenStreetMap iframe or OpenStreetMap page link). The preview loads `/api/mapbox/static`, which uses the private `MAPBOX_API_KEY` server secret (Wrangler secret; never a client value) to build `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/…`, so neither the token nor a `mapbox.com` URL reaches the DOM. The proxy sends a `Referer` from `MAPBOX_REFERER` (default `http://localhost:5184/`) because a URL-restricted Mapbox token rejects requests without an allowlisted Referer (403 → 502); production must set `MAPBOX_REFERER` to the deployed origin and include it in the token's URL restrictions. Missing/invalid coordinates, an unset key, or a failed fetch show a muted “Map preview unavailable” fallback while name/hours remain. Location search geocodes the requested place through OpenStreetMap Nominatim (`src/lib/server/geo.ts`), ranks rows with finite coordinates by haversine distance (25-mile radius, nearest-first, max 20, `distanceMiles`), and falls back to name/address substring matching when geocoding fails or rows lack coordinates. Data limitation: the raw Nessie ATM dataset has 13 ATMs, all in Arlington, VA (~396 straight-line miles from Cambridge, MA), so the geographic search returns the nearest available rows even when none are close. In that case the prose says no ATMs were found within 25 miles and states the nearest straight-line distance rather than claiming the ATMs are near; the intro reads “Here are the closest ATMs I found:” (branches keep “Here is what's nearby:”). Nominatim remains the geocoder, and a Cambridge/Boston ATM source would be a separate feature.
- [x] **Prompt.** Add a short intro/takeaway or primitive-card rule only if the card needs framing; every answer leaves the customer with a natural-language takeaway and a practical next step in prose, with no labels, every card explained, and no card-value restatement.
- [x] **Tests.** Unit tests for valid/empty/malformed payloads, selection, whitelist, identity, anchoring, and dedupe. Update E2E expectations (do not run Playwright under current policy).
- [x] **Verification.** `npm run check`, `npm test`, and `npm run build` pass. Browser E2E is intentionally skipped. Optionally confirm `/api/health` and `/chat` return 200.
- [x] **Docs.** Update this checklist and the corresponding status/table rows in `CARD_PLAN.md`.

## Final verification

Independent acceptance verification at HEAD `ef0167a` (remote `origin/main` in sync):

- `npm run check` — 0 errors / 0 warnings.
- `npm test` — 303 passed across 32 files.
- `npm run build` — green.
- Runtime smoke: `/api/health`, `/chat`, and `/dashboard` return 200.
- Live SSE for bills and suspicious activity: no `error` events; a natural takeaway and next step present; client-inferred card fallback works.
- Active `src/` has no legacy cards/relevance/dedupe/`ChatCard`/`chatCardKind` coupling (archive-only).
- E2E spec is type-valid; Playwright was intentionally not run under current policy.

Residual limitations (unchanged):

- `present_card` supports account, bill, loan, transaction, merchant, location, and profile kinds; category, cashflow, recurring, reward, and goal cards remain client-inferred because the tools expose no stable single entity id.
- Several primitive library components remain library-only: `AccountTag`, `ShareBar`, `DeltaBadge`, `Sparkline`, `InlineAction`, `InlineEmpty`, `ExpandRow`, `DefinitionHint`, `BufferedPlaceholder`.
- Data-source gaps: recurring charges carry no cadence or next date, ATMs carry no street address, and locations carry no distance. Cards omit those fields rather than inventing them.
