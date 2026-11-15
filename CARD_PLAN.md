# Eno 2.0 chat cards and inline primitives

Canonical inventory and plan for every chat card and inline primitive in Eno 2.0.

Status: Phase 0 shipped (legacy cards archived, chat is prose-first). Phase 1 (`present_card`) is shipped. Phase 2 and the Phase 3 primitive cards are largely shipped: inline single-transaction cards, a merged transaction-list card, the spending-by-category pie chart, single Bill/Account cards, single Loan/Location/RecurringCharge cards, and the Reward/Goal/CashflowPoint cards are live, along with the shared `EntityKeyValue` primitive and the shared primitives library (`primitives.ts` plus `inline-cards/primitives/`). Merchant and profile cards are now shipped too, along with the ClimateWise snapshot card. The server-side `present_card` pipeline, ownership validation, normalized `card` SSE event, and `CARDS_MODE=off|v2` flag are live; client-side builders remain the fallback.

See `GOAL_PLAN.md` for the active implementation checklist; this document remains the canonical detail and design reference.

Code directories:

- `src/routes/[view=wallet]/inline-cards/` — active card components.
- `src/routes/[view=wallet]/ChatPanel.svelte` — inline placement and streaming UI.
- `src/lib/chat/` — client-safe card models, builders, and layout helpers.
- `src/lib/chat/archive/legacy-cards/` — archived Phase 0 cards (do not use).
- `src/lib/server/` — prompt, SSE contract, agent loop, and deterministic narration.

`docs/plans/inline-entity-cards.md` is a pointer to this document. This file is the source of truth.

## 1. Purpose and status

Eno 2.0 answers from grounded banking tools. Cards are small, reusable data displays placed inline in the assistant's prose; they never replace the explanation. The assistant writes the novel insight, comparison, ranking, and tip, while the card shows the primitive data those claims refer to.

Shipped:

- Phase 0: legacy broad cards archived; chat is prose-only.
- Phase 2 first slice: `TransactionCard` for anomaly findings (one card per flagged transaction, capped at 8 per turn for layout/performance), `TransactionListCard` for multi-transaction answers (max 8 rows plus “N more transactions”), and the spending pie chart for `insight_spending_breakdown`.
- Phase 2 second slice: `BillCard` (one largest upcoming bill from `insight_upcoming_bills`) and `AccountCard` (exactly one account; never an account list), plus the shared `StatusChip` primitive.
- Phase 2 third slice: `LoanCard` (one loan), `LocationCard` (one ATM or branch), and `RecurringChargeCard` (one recurring charge), each a single-entity primitive.
- Phase 3 first slice: `RewardCard` (highest credit-account reward or overview total), `GoalCard` (target/current/months/projected date), `CashflowPointCard` (latest complete month), plus the shared `EntityKeyValue` primitive.
- Phase 3 second slice: `MerchantCard` (one merchant, first valid row) and `ProfileCard` (one customer from a single-row payload, name plus city/state only).
- ClimateWise: `ClimateWiseCard` (score, tier, total kg over the window) plus the `insight_climatewise` MCP tool. The dashboard widget, `/climatewise` page, and chat all read the same MCP report through `/api/climate`.
- Phase 1: `present_card`, server-side ownership validation, the normalized `card` SSE event, and the `CARDS_MODE=off|v2` flag. Model-declared cards are additive; client-side inference still runs and remains the fallback.

Next:

- None. Phase 4 cleanup shipped; residual limitations are noted under Shipped (`present_card` kind coverage and library-only primitives).

## 2. Design principles

- **Primitive first.** Cards are as simple and primitive as possible: one entity or one basic series. A card is a small, reusable data display that the AI composes and interprets.
- **No baked-in interpretation.** No titles, reason tags, counts, rankings, “top category,” recommendations, combined summaries, or broad/fallback cards.
- **Prose carries the insight.** The AI produces the novel insight, ranking, comparison, recommendation, or takeaway in prose. The card must not bake those in.
- **Prefer omission.** Prefer omitting a card over showing a broad or interpretive one.
- **Card budget.** Anomaly findings get one inline `TransactionCard` each, capped at 8 per turn for layout/performance; every flagged transaction with valid fields gets a card. Other primitive cards remain at 1–2 per turn. The previous 1–2 cap was a layout budget, not a limit on how many transactions could be flagged. Lists use their matching card when one exists; transaction lists use the transaction-list card; lists with no card kind stay brief in prose.
- **Inline placement.** Intended rhythm: one short intro sentence → card → takeaway. Cards are buffered until the streamed prose reaches their anchor.
- **Inline single cards, standalone series cards.** Single-entity cards (`transaction`, `bill`, `account`, `loan`, `location` branches, `recurring`, `reward`, `goal`, `cashflow`, `merchant`, `profile`) render inline inside the assistant prose bubble (`.bubble.assistant`), using the shared `CardFrame` DOM restyled by the bubble: 1px border, no lift shadow, no top accent, width capped by the bubble. Multi/series cards (`transaction-list`, `spending-pie`) stay standalone: high-contrast `CardFrame` (surface, border, lift shadow — no top accent strip), left-aligned and capped at the Eno chat bubble max width (88% of the assistant content column). The **ATM locator** (`location` with `payload.type === 'atm'`) is the one single-entity exception: its map card renders standalone (not in the bubble), and its Apple/Google actions sit below that card, outside both the card surface and the bubble, as two equal half-width buttons on an 88%-wide row; the buttons are text-only (no icons), at least 44px tall, and highlight with a link-tinted background on hover/focus rather than an underline.
- **Every card is explained.** Each rendered card must be explained in the prose: say what it supports or why it matters. A card is evidence for the insight, not a standalone list item. When several cards share a reason, explain the pattern once and name the merchants.
- **No duplicated data.** Prose does not restate values, names, dates, statuses, or rows visible in a card. It adds meaning or a next step. Anomaly prose names each flagged merchant and explains the pattern (`possible duplicate` or `unusually large purchase`) without restating card amounts, dates, statuses, or rows.

Examples:

- `TransactionCard` = merchant, date, amount.
- `TransactionListCard` = transaction rows.
- `PieChartCard` = period plus category shares and amounts.
- A “top category” statement or “you spent too much on shopping” belongs in the response, not the card.

## 3. Current runtime flow

Server (`src/routes/api/chat/+server.ts` → `src/lib/server/agent.ts`):

- SSE events: `tool_start` → `tool_result` → `insight` (with `kind`, `payload`, optional `accountId`) → `card` (normalized `EntityCard`, only when the model calls `present_card`) → `text` deltas → `usage` → `done`.
- The agent defaults to the Gemini loop for complex or unknown questions.
- A conservative deterministic fast path handles a known single-tool intent: it emits the tool result and insight, then `composeIntro` plus `composeFastAnswer` text (for example spending and bills), avoiding a second model round trip.
- Insight payloads are generated by the deterministic `insight_*` tools in `src/lib/server/nessie/tools/insights.ts`.

Client (`src/routes/[view=wallet]/ChatPanel.svelte`):

1. The SSE parser appends text deltas and builds normalized `EntityCard` values in `message.inlineCards` from selected insights; built-in builders cover anomalies, transaction lists, spending pies, single bills, single accounts, single loans, single locations, single recurring charges, rewards, goal projections, and monthly cashflow. There is no legacy `message.cards` collection.
2. Rendering derives, in order:
   - `anchorEntityCards(text, cards)` re-anchors transaction and recurring cards after their description, bill cards after their payee, account cards after their nickname (or type), loan cards after their type, location cards after their name, reward cards after their label, and cashflow cards after their period. Goal cards are not name-anchored.
   - `revealInlineCards(cards, textLength, pending)` buffers cards until the streamed text reaches their `afterText` offset.
   - `inlineBlocks(text, readyCards)` splits prose into text and card blocks, never splitting a markdown code/bold/italic span.
   - `groupInlineCards(blocks)` groups text and single-entity cards into one inline bubble group, flushing around each standalone card in order. `isInlineCard(card)` decides placement: `transaction-list`/`spending-pie` and `location` cards with `payload.type === 'atm'` are standalone; branch locations and all other single kinds stay inline.
3. Inline groups render as one `.bubble.assistant.inline-entities` containing markdown plus inline cards (via `ChatCardView`); standalone groups render outside the bubble as framed cards.
4. When prose is empty, `ensureExplanation` supplies a deterministic sentence for anomalies and transaction lists.
5. Follow-ups are generated dynamically from the actual cards just rendered, the assistant answer text, the asked prompt, and the loaded accounts (`followUpsFor(EntityCard[], prompt, assistantText, accounts)`). Clarification questions produce one-click answers first (account, category, month, target amount, charge, yes/no), card payloads supply card-specific prompts next, and the static topic matrix (`classifyIntents` for prompt intents) is fallback/fill only. The pure function returns 3–4 rows (deduped, never repeating the asked prompt); the UI shows at most 3.

Deep links: `transactionHref` builds `/dashboard?customer=…&account=…&txn=…`; `accountHref` builds `/dashboard?customer=…&account=…` and opens the account Activity view. The dashboard reads those query parameters and scrolls/highlights the matching row. Cards without complete ids render without a link.

Buffering details:

- A card's `afterText` is the assistant text length when the insight arrived, or end-of-text for cards that arrive before any prose.
- While a turn is pending, only cards whose anchor is at or before the current text length render, so text always introduces its card.
- At `done`, all cards reveal; unanchored cards clamp to the end of the prose.
- Offsets inside a markdown span move to the span end, so cards never split `**bold**`, `*italic*`, or `` `code` ``.

## 4. Active inline components inventory

| File | Props / API | Status | Notes |
| --- | --- | --- | --- |
| `src/routes/[view=wallet]/inline-cards/CardFrame.svelte` | `label?: string`, `children` snippet | Shipped | Shared standalone frame: surface, border, radius, contrast shadow. No accent strip. Width capped at the chat bubble max (88% of the assistant content column) and left-aligned. No title slot. |
| `src/routes/[view=wallet]/inline-cards/OpenIcon.svelte` | none | Shipped | External-link icon for deep-linked rows; decorative. |
| `src/routes/[view=wallet]/inline-cards/TransactionCard.svelte` | `card: TransactionEntityCard`, `inline?: boolean` | Shipped | Single merchant/date/amount. `inline` mode renders a compact row inside `.bubble.assistant`; no flags or reasons. Deep link. |
| `src/routes/[view=wallet]/inline-cards/TransactionListCard.svelte` | `card: TransactionListEntityCard` | Shipped | Multiple rows, cap 8 plus “N more transactions”; every row deep-links; standalone `CardFrame`. |
| `src/routes/[view=wallet]/inline-cards/PieChartCard.svelte` | `card: SpendingPieEntityCard` | Shipped | Filled SVG pie plus period and category/share/amount legend. Primitive: no editorial labels, rankings, or recommendation text. Top 5 plus `Other`. |
| `src/routes/[view=wallet]/inline-cards/StatusChip.svelte` | `status: string` | Shipped | Small factual status chip (`pending`, `paid`, `overdue`, …). No reason or interpretation; theme-aware and never colour-only. |
| `src/routes/[view=wallet]/inline-cards/BillCard.svelte` | `card: BillEntityCard` | Shipped | One bill: payee, due date, amount, status chip. Optional deep link to the owning account. No coverage, total, or recommendation text. |
| `src/routes/[view=wallet]/inline-cards/AccountCard.svelte` | `card: AccountEntityCard` | Shipped | One account: nickname, type, masked number, balance, rewards when positive. Whole card deep-links to the account view. Never an account list. |
| `src/routes/[view=wallet]/inline-cards/LoanCard.svelte` | `card: LoanEntityCard` | Shipped | One loan: type/description, balance, monthly payment, factual status chip. Optional deep link to the owning account. No credit score, title, or recommendation text. |
| `src/routes/[view=wallet]/inline-cards/LocationCard.svelte` | `card: LocationEntityCard` | Shipped | One branch: name, address, hours when present. `.location-card`. No distance (not in the data) and no deep link. |
| `src/routes/[view=wallet]/inline-cards/AtmLocatorCard.svelte` | `card: LocationEntityCard` (ATM subtype) | Shipped | ATM only, standalone: a Mapbox map card (name, distance when available, hours, server-proxied `<img>` with no token in the DOM) with a separate actions row below it holding “Open in Apple Maps” and “Open in Google Maps”. `.atm-locator-card` is the map surface; `.atm-actions` sits outside it and outside the prose bubble, with two equal half-width buttons. The buttons are text-only (no icon), at least 44px tall (10px padding, 12px type), and use a link-tinted background/border/shadow highlight on hover/focus instead of an underline. Missing coordinates, a missing key, or a failed image show a muted “Map preview unavailable” fallback; name/hours remain. |
| `src/routes/[view=wallet]/inline-cards/RecurringChargeCard.svelte` | `card: RecurringChargeEntityCard` | Shipped | One recurring charge: description, average amount, months seen, last date. No cadence or next date (not in the data) and no subscription/cancel copy. |
| `src/routes/[view=wallet]/inline-cards/EntityKeyValue.svelte` | `label: string`, `value: string` | Shipped | One compact label/value row; theme-aware, tabular value, no editorial styling. |
| `src/routes/[view=wallet]/inline-cards/RewardCard.svelte` | `card: RewardEntityCard` | Shipped | One reward balance: label and `points.toLocaleString()` plus “pts”. Optional account deep link. No invented dollar value. |
| `src/routes/[view=wallet]/inline-cards/GoalCard.svelte` | `card: GoalEntityCard` | Shipped | One goal: `EntityKeyValue` rows for target, current, months to target, and projected date. Optional account deep link. No on-track or advice copy. |
| `src/routes/[view=wallet]/inline-cards/CashflowPointCard.svelte` | `card: CashflowPointEntityCard` | Shipped | One month: `EntityKeyValue` rows for period, inflow, outflow, and signed net. No interpretation. |
| `src/routes/[view=wallet]/inline-cards/MerchantCard.svelte` | `card: MerchantEntityCard` | Shipped | One merchant: name, title-cased category when present, address when present. No amount, count, recommendation, or link. |
| `src/routes/[view=wallet]/inline-cards/ProfileCard.svelte` | `card: ProfileEntityCard` | Shipped | One customer: initials avatar, name, and city/state when present. No street, zip, contact, or identifier fields; no action copy. |
| `src/routes/[view=wallet]/inline-cards/ClimateWiseCard.svelte` | `card: ClimateWiseEntityCard` | Shipped | One ClimateWise snapshot: score and tier with a gauge, total kg CO₂e over the window, and a “View ClimateWise details” link to `/climatewise?customer=…`. No title, logo, eyebrow, reason chip, or duplicated value. |
| `src/routes/[view=wallet]/inline-cards/ChatCardView.svelte` | `card: EntityCard`, `inline?: boolean` | Shipped | Shared card switch: routes each `kind` to its component (ATM locations to `AtmLocatorCard`, branches to `LocationCard`) and passes the inline flag to `TransactionCard`. Non-transaction inline styling comes from the bubble-scoped CSS. |
| `src/routes/[view=wallet]/ChatPanel.svelte` | `open`, `customerId`, `initialPrompt`, `onClose`, `canSend`, `variant` | Shipped | Bubbles, streaming text, grouped inline/standalone cards, thinking checklist, loading line, follow-ups, send/abort lifecycle. |
| `src/lib/chat/thinking.ts` | `initialThinking`, `pushThinkingStep`, `friendlyToolLabel`, `THINKING_COMPOSING` | Shipped | Pure, non-technical thinking-step state machine. |
| `src/lib/components/EnoThinking.svelte` | `active?: boolean`, `variant?: EnoVariant`, `size?: number` | Shipped | Eno avatar; pulses while active. |
| `src/routes/[view=wallet]/FollowUps.svelte` | `suggestions`, `disabled?`, `onSelect` | Shipped | Borderless suggested follow-up rows with a leading down-then-right elbow arrow. The hover/focus highlight is the only rounded surface (`border-radius: 8px`, link-tinted background); rows keep no dividers, no underline, and a transparent rest background. |
| `src/lib/components/Eno.svelte` | `variant?`, `size?`, `alt?`, `class?` | Shipped | Static Eno image used by layout/empty states. |
| `src/lib/chat/inline.ts` | `revealInlineCards`, `inlineBlocks` | Shipped | Pending buffer, markdown-safe anchors, text/card block split. |
| `src/lib/chat/cardGroups.ts` | `groupInlineCards`, `isInlineCard`, `isInlineCardKind`, `InlineRenderGroup` | Shipped | Pure client-safe grouping: text plus single-entity cards into one inline group; standalone cards (`transaction-list`, `spending-pie`, and the ATM `location` exception) flush and emit separately; order preserved. |
| `src/lib/chat/entityCards.ts` | types plus `anomalyTransactionCards`, `transactionListCard`, `mergeTransactionListCard`, `spendingPieCard`, `billCard`, `accountCard`, `loanCard`, `locationCard`, `recurringCard`, `rewardCard`, `goalCard`, `cashflowCard`, `merchantCard`, `profileCard`, `climateWiseCard`, `anchorEntityCards`, `mergeEntityCards`, `transactionHref`, `accountHref` | Shipped | Pure, client-safe normalization and placement helpers. |

Avatar/layout note: the assistant turn uses `EnoThinking` to the left of `.assistant-content`, aligned to the **bottom** of the message (not the top); the flex row and 10px gap are unchanged, and the avatar keeps its pulse/active state, size, and theme variant. Single-entity cards render inside the assistant prose bubble, so their width is capped by the bubble; the bubble-scoped rule removes the standalone lift shadow and keeps the 1px border with no accent. Standalone cards are siblings in the content column, left-aligned and capped at the bubble max width (88% of the column); `CardFrame` provides surface, border, and lift shadow with no accent strip. The pie and list cards are intentionally standalone `CardFrame` cards, never pulled into the prose bubble. The ATM locator is the one single-entity exception: because it pairs a wide map with external actions, it is grouped standalone too. Its map card contains no buttons; `.atm-actions` sits below the card, outside both the card surface and the prose bubble, as a two-column grid at the same 88% width with two equal half-width buttons. Those buttons are text-only (no icons), at least 44px tall, and signal hover/focus with a link-tinted background/border/shadow highlight rather than an underline.

ATM map note: `find_nearby_atms` results carry geocoded `lat`/`lng` and no street address, so ATMs render `AtmLocatorCard` (name, optional distance, hours, and a map preview) while branches keep `LocationCard` (name, address, hours). The ATM locator is a standalone card, not inline in the prose bubble: `cardGroups.isInlineCard` treats `location` cards with `payload.type === 'atm'` as standalone (branches stay inline), so the ATM flushes the inline group and renders as a `card` group. The map card loads a Mapbox Static Images preview from the server-side proxy `/api/mapbox/static?lat=…&lng=…&zoom=15` as an `<img>`; the proxy builds `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s(…)…` with the private `MAPBOX_API_KEY` server secret and streams the image, so no token or `mapbox.com` URL reaches the client/DOM. The proxy sends the `MAPBOX_REFERER` value (default `http://localhost:5184/`) because a URL-restricted Mapbox token rejects requests without an allowlisted Referer (403 → 502); the deployed origin must be set in `MAPBOX_REFERER` and added to the token's URL restrictions. The map card contains only name/distance/hours/map — no buttons. Below it, outside the card surface and outside the prose bubble, `.atm-actions` holds explicit “Open in Apple Maps” (`https://maps.apple.com/?ll=…&q=…&z=16`) and “Open in Google Maps” (`https://www.google.com/maps/search/?api=1&query=…`) links labelled with the ATM name, via the pure helpers in `src/lib/chat/maps.ts`. The actions row matches the card’s 88% max width and uses two equal columns (8px gap), so each button is about half the card width; a lone link spans the row. The buttons are text-only (no icon), at least 44px tall (10px padding, 12px type), and highlight on hover/focus with a link-tinted background, border, and shadow instead of an underline. There is no OpenStreetMap map iframe or OpenStreetMap page link. Missing/invalid coordinates, a missing key, or a failed image show the muted “Map preview unavailable” fallback (name/hours/distance and the external actions remain).

Geographic search note: `find_nearby_atms` and `find_nearby_branches` first geocode the requested place with OpenStreetMap Nominatim (`src/lib/server/geo.ts`: ~4s timeout, descriptive User-Agent, in-memory ~1h cache including misses, one request per second). Rows with finite `geocode.lat/lng` are scored with a haversine distance, kept within 25 miles when any qualify (otherwise the nearest rows are returned), sorted nearest-first, and capped at 20 with `distanceMiles` rounded to one decimal. If geocoding fails or no rows carry coordinates, the tool falls back to the previous case-insensitive name/address substring match. `locationCard` parses `distanceMiles` into the normalized payload.

Nessie ATM data limitation: the raw Nessie ATM dataset contains 13 ATMs, all in Arlington, VA (~396 straight-line miles from Cambridge, MA). Because the geographic search returns the nearest available rows even when none fall inside 25 miles, `atmAnswer` must not imply proximity: when the nearest `distanceMiles` exceeds 25 it says no ATMs were found within 25 miles and states the honest nearest straight-line distance (keeping the numeric distance for transparency, even though the card also shows it). The `find_nearby_atms` intro is neutral (“Here are the closest ATMs I found:”) while branch intros keep “Here is what's nearby:”. A Cambridge/Boston ATM source (for example OpenStreetMap Overpass) would be a separate feature; no such data is claimed today.

## 5. Card catalog

| Card | Kind / entity | Normalized payload | Source / insight or tool | Placement | Status | File / path | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TransactionCard` | `transaction` | `description`, `amount`, `date`, `flag` (inference only), `duplicateOf?`, `transactionId`, `accountId?`, `customerId?` | `insight_anomalies` findings | Inline inside `.bubble.assistant` | Shipped | `inline-cards/TransactionCard.svelte`; `entityCards.ts` | No reason chip; prose explains why it stands out. Deep-links when ids exist. |
| `TransactionListCard` | `transaction-list` | `rows[]` (`id`, `description`, `amount`, `date`, `status?`, `accountId?`, `customerId?`), `more` | Deposit/withdrawal transaction tools (recent/all prompts); `insight_top_transactions` for filtered/ranked lists | Standalone `CardFrame` | Shipped | `inline-cards/TransactionListCard.svelte`; `entityCards.ts` | Deposits and withdrawals in one turn merge into one list. Raw withdrawal/deposit list cards are gated to recent/all-transaction prompts; ranked or filtered questions use `insight_top_transactions` so the rows match. Cap 8, “N more transactions”. |
| `SpendingPieCard` / pie | `spending-pie` | `period`, `total`, `slices[]` (`label`, `amount`, `share`) | `insight_spending_breakdown` | Standalone `CardFrame` | Shipped in this pass | `inline-cards/PieChartCard.svelte`; `spendingPieCard` | Latest complete month; top 5 plus `Other`; period plus percentage legend; no editorial analysis. |
| `BillCard` | `bill` | `billId`, `payee`, `amount` (nullable), `dueDate`, `status?`, `accountId?`, `customerId?` | `insight_upcoming_bills`, bill tools | Inline inside `.bubble.assistant` | Shipped in this pass | `inline-cards/BillCard.svelte`; `billCard` | One bill per card: the largest amount, earliest due date on a tie, matching the deterministic prose. Coverage and totals stay in prose. Optional deep link. |
| `AccountCard` | `account` | `accountId`, `nickname`, `type`, `maskedNumber`, `balance` (nullable), `rewards` (nullable), `customerId?` | Account tools | Inline inside `.bubble.assistant` | Shipped in this pass | `inline-cards/AccountCard.svelte`; `accountCard` | Exactly one account. `asItems` must yield one row; zero or many returns null so prose answers. Whole card deep-links. |
| `LoanCard` | `loan` | `loanId`, `type`, `balance` (nullable), `monthlyPayment` (nullable), `status?`, `accountId?`, `customerId?` | `nessie_list_account_loans` | Inline inside `.bubble.assistant` | Shipped in this pass | `inline-cards/LoanCard.svelte`; `loanCard` | One loan: the largest balance, with type/description breaking ties. Optional account link. No credit score or recommendation. |
| `SpendingCategoryCard` | `category` | `name`, `amount`, `share`, `period` | Spending breakdown | Standalone | Planned; represented by the pie | `spendingPieCard` | The old single-category card is superseded by the primitive pie (period + category shares). A “top category” claim belongs in prose. |
| `LocationCard` | `location` (branch subtype) | `locationId`, `name`, `address`, `hours?`, `type: 'branch'`, `lat?`, `lng?`, `distanceMiles?`, `customerId?` | `find_nearby_branches` | Inline inside `.bubble.assistant` | Shipped in this pass | `inline-cards/LocationCard.svelte`; `locationCard` | One branch: the nearest result when geocoded. Addresses are composed from street/city/state/zip. Distance is shown when the tool returns `distanceMiles`. |
| `AtmLocatorCard` | `location` (ATM subtype) | `locationId`, `name`, `address` (empty), `hours?`, `type: 'atm'`, `lat?`, `lng?`, `distanceMiles?`, `customerId?` | `find_nearby_atms` | Standalone in the assistant content column (not the prose bubble) | Shipped in this pass | `inline-cards/AtmLocatorCard.svelte`; `locationCard` | One ATM: the nearest result, name/hours/distance plus a server-proxied Mapbox Static Images preview. The `.atm-actions` row sits below the map card, outside its surface and the bubble, with equal half-width Apple/Google Maps buttons (text-only, at least 44px tall, with a link-tinted background highlight on hover/focus rather than an underline). No street address. Missing coordinates or a failed preview show “Map preview unavailable”; no token in the client. |
| `RecurringChargeCard` | `recurring` | `chargeId`, `description`, `averageAmount` (nullable), `monthsSeen`, `lastDate`, `customerId?` | `insight_recurring_charges` | Inline inside `.bubble.assistant` | Shipped in this pass | `inline-cards/RecurringChargeCard.svelte`; `recurringCard` | One charge: the largest average amount. `chargeId` is `description|amount` (the source has no id). No cadence or next date, because the source has none. |
| `RewardCard` | `reward` | `rewardId`, `label`, `points`, `accountId?`, `customerId?` | `nessie_list_customer_accounts` accounts list; `insight_financial_overview` total | Inline inside `.bubble.assistant` | Shipped in this pass | `inline-cards/RewardCard.svelte`; `rewardCard` | One reward: the highest `rewards > 0` on a credit account, labelled by nickname (or type), else the positive overview `totalRewards` as “Total rewards”. No invented dollar value. Optional account link. |
| `GoalCard` | `goal` | `goalId`, `accountId?`, `target`, `current`, `monthsToTarget`, `projectedDate?`, `customerId?` | `insight_goal_projection` | Inline inside `.bubble.assistant` | Shipped in this pass | `inline-cards/GoalCard.svelte`; `goalCard` | One goal: target, current balance, months to target when finite, and a projected date when `asOf` parses. No on-track, progress narrative, or advice copy. Optional account link. |
| `CashflowPointCard` | `cashflow` | `period`, `inflow`, `outflow`, `net` | `insight_financial_overview.monthlyCashflow` | Inline inside `.bubble.assistant` | Shipped in this pass | `inline-cards/CashflowPointCard.svelte`; `cashflowCard` | One month: the latest complete month, falling back to the last entry. Net uses the provided value or inflow minus outflow, signed in display. No interpretation. |
| `MerchantCard` | `merchant` | `merchantId`, `name`, `category?`, `address?`, `customerId?` | `nessie_list_merchants`, `nessie_get_merchant` | Inline inside `.bubble.assistant` | Shipped in this pass | `inline-cards/MerchantCard.svelte`; `merchantCard` | One merchant: the first valid row, anchored after its name mention. Address composes `street, city, state`. The source has no spend amount or transaction count, so neither is shown; no recommendation or link. |
| `ProfileCard` | `profile` | `customerId`, `name`, `location?` (`City, State`) | `nessie_get_customer`, single-customer payloads | Inline inside `.bubble.assistant` | Shipped in this pass | `inline-cards/ProfileCard.svelte`; `profileCard` | One customer only; a customer list returns null and stays in prose. Name plus city/state only: never street, zip, phone, email, or account/customer identifiers in the payload or DOM. |
| `ClimateWiseCard` | `climatewise` | `score`, `tier`, `totalKg`, `days`, `annualizedTonnes?`, `benchmarkTonnes?`, `topCategory?`, `customerId?` | `insight_climatewise` | Inline inside `.bubble.assistant` | Shipped in this pass | `inline-cards/ClimateWiseCard.svelte`; `climateWiseCard` | One ClimateWise snapshot: score, tier, total kg CO₂e over the window, and a link to the full `/climatewise` page. `topCategory` is derived from the highest-kg category for follow-ups; the card itself shows no interpretation. |

Explicitly omitted:

- `Overview` / all-purpose snapshot card.
- `AccountList` / all-accounts card.
- `Fallback` / “More information” / unknown-tool card.
- Broad anomaly list card (the primitive is one single-transaction card per finding, capped at 8).
- Raw tool-payload dump cards.

Archived legacy cards in `src/lib/chat/archive/legacy-cards/` (18 files, archived in Phase 0, do not use):

`AccountCard.svelte`, `AccountListCard.svelte`, `AnomaliesCard.svelte`, `BillsCard.svelte`, `CashflowCard.svelte`, `ChatCardRenderer.svelte`, `ChatCardShell.svelte`, `CustomerCard.svelte`, `FallbackCard.svelte`, `GoalCard.svelte`, `LoansCard.svelte`, `LocationsCard.svelte`, `MerchantsCard.svelte`, `README.md`, `RecurringCard.svelte`, `RewardsCard.svelte`, `SpendingCard.svelte`, `TransactionsCard.svelte`.

## 6. Shared primitive components (shipped)

Reusable display primitives keep cards small and consistent. None of these introduce editorial interpretation. Pure formatting helpers live in `src/lib/chat/primitives.ts`; Svelte components live in `src/routes/[view=wallet]/inline-cards/primitives/`.

| Primitive | Purpose | Status | Notes |
| --- | --- | --- | --- |
| `MoneyText` / `signedMoney` | Currency formatting and sign display | Shipped | Component plus pure helper. Used by `TransactionCard`, `TransactionListCard`, `BillCard`, `LoanCard`, `RecurringChargeCard`, `CashflowPointCard`, and `AccountCard`. No colour-only sign meaning. |
| `DateText` / `relativeDateLabel` | Consistent absolute and relative dates | Shipped | Component plus pure helper. Used by `TransactionCard`, `TransactionListCard`, `BillCard`, and `RecurringChargeCard`. |
| `StatusChip` | Status text | Shipped | Factual state only, never a reason tag. Used by `BillCard` and `LoanCard`. |
| `AccountTag` | Account name/mask | Shipped (library-only) | Compact `nickname / type · masked`; no link. |
| `EntityKeyValue` | Label/value rows | Shipped | One compact row; theme-aware and tabular. Optional children let `MoneyText` supply the value (`CashflowPointCard`). Used by `GoalCard` and `CashflowPointCard`. |
| `ProgressMeter` | Goal or coverage progress | Shipped | Factual meter only; `role="progressbar"` with min/max/now. Used by `GoalCard`. |
| `ShareBar` | Single share of a whole | Shipped (library-only) | Lighter alternative to the pie; no editorial copy. |
| `DeltaBadge` | Month-over-month difference | Shipped (library-only) | Value and direction only, with a textual direction for accessibility. |
| `Sparkline` | Basic inline series | Shipped (library-only) | One series; `role="img"` with a label; no annotation text. |
| `InlineAction` | Deep link / “open” affordance | Shipped (library-only) | Anchor styling; adds `target="_blank"` and `rel="noopener noreferrer"` when external. |
| `TruncationFooter` | “N more transactions” row | Shipped | Extracted from `TransactionListCard` and used there. |
| `InlineEmpty` | Honest empty state | Shipped (library-only) | Muted row only; prefer prose-only when there is no data. |
| `ExpandRow` | Reveal additional rows | Shipped (library-only) | Native `<details>/<summary>`; client-only, no refetch. |
| `DefinitionHint` | Small field explanation | Shipped (library-only) | `<details>` hint; no advice. |
| `BufferedPlaceholder` | Space reservation while a card is buffered | Shipped (library-only) | Optional subtle skeleton; current UI still omits buffered cards. |

The principle stays explicit: primitives are data-only. They carry no titles, rankings, reasons, recommendations, or advice; those belong in the assistant prose.


## 7. Data model and inference

Types (`src/lib/chat/entityCards.ts`):

```ts
interface EntityCardBase {
  id: number;             // client render key
  entityId: string;       // stable per-turn identity, used for dedupe
  afterText?: number;     // character offset into assistant prose
}

type EntityCard =
  | (EntityCardBase & { kind: 'transaction'; payload: TransactionCardPayload })
  | (EntityCardBase & { kind: 'transaction-list'; payload: TransactionListPayload })
  | (EntityCardBase & { kind: 'spending-pie'; payload: SpendingPiePayload })
  | (EntityCardBase & { kind: 'bill'; payload: BillCardPayload })
  | (EntityCardBase & { kind: 'account'; payload: AccountCardPayload })
  | (EntityCardBase & { kind: 'loan'; payload: LoanCardPayload })
  | (EntityCardBase & { kind: 'location'; payload: LocationCardPayload })
  | (EntityCardBase & { kind: 'recurring'; payload: RecurringChargeCardPayload })
  | (EntityCardBase & { kind: 'reward'; payload: RewardCardPayload })
  | (EntityCardBase & { kind: 'goal'; payload: GoalCardPayload })
  | (EntityCardBase & { kind: 'cashflow'; payload: CashflowPointCardPayload })
  | (EntityCardBase & { kind: 'climatewise'; payload: ClimateWiseCardPayload });
```

- Payloads are whitelisted view models. Raw tool records never pass through.
- `entityId` identifies the entity within a turn: a transaction id or stable key, the single `transaction-list`, `spending-pie`, the bill id (or a stable `bill|payee|dueDate|amount` key), `account:<id>`, `loan:<id>`, `location:<id>`, `description|amount` for a recurring charge, `reward:<accountId|total>`, `goal:<accountId>:<target>`, `cashflow:<month>`, or the single `climatewise`.
- `afterText` is the pending buffer/anchor contract; missing offsets render at end-of-text.
- Anomaly cards dedupe by `entityId`, render one card per finding, and cap at 8. The previous 1–2 cap was a layout budget, not a limit on flagged findings. A turn keeps one transaction list, one pie, one bill, one account, one loan, one location, one recurring charge, one reward, one goal, and one cashflow month, replacing rather than stacking duplicates.
- Bill, account, loan, location, recurring, reward, goal, and cashflow cards are single-entity by construction: one largest bill, only a payload whose `asItems` resolves to exactly one account, one largest loan, the first location result, one largest recurring charge, one highest credit-account reward (or one overview total), one goal projection, and one complete cashflow month. Lists render no entity card and stay in prose.
- Data limitations: recurring charges carry no cadence or next date, ATMs carry no street address, and locations carry no distance. Cards omit those fields rather than inventing them.

Inference:

- **Preferred (shipped, `CARDS_MODE=v2`):** a read-only `present_card({ kind, id })` tool. The model resolves the entity through normal tools, then declares it for display. The server keeps a turn-local candidate list from successful data-tool results (`src/lib/server/presentCard.ts`), validates ownership against the session customer, normalizes a whitelisted `EntityCard`, and emits a `card` SSE event with `afterText` = the assistant text length at declaration time. Supported kinds: `account`, `bill`, `loan`, `transaction`, `merchant`, `location`, `profile`. Ownership is mandatory for account/bill/loan/transaction/profile; merchant and location are public. The tool never fetches.
  - Candidates are collected per tool: account tools (`nessie_list_customer_accounts`, `nessie_get_account`), bill tools including `insight_upcoming_bills`, loan tools, deposit/withdrawal/purchase/transfer transaction tools (account id from the call args), merchant tools, nearby ATM/branch tools, and `nessie_get_customer` (only when the id equals the session customer).
  - The model is told to call it at most twice per turn, only for single entities and only when the id is known. Rejected declarations emit `tool_result` with `ok:false` and no card.
  - `CARDS_MODE=off` removes the declaration and the server handling; the client-side builders below continue unchanged.
  - Limitation: category, cashflow, recurring, reward, and goal cards have no stable single entity id exposed by the tools, so they remain client-inferred for now.
- **Fallback (always available):** deterministic client-side builders from this turn's insights. A `card` event and a builder card dedupe/replace by `entityId`:
  - `insight_anomalies` → transaction cards (`anomalyTransactionCards`), then `anchorEntityCards` re-anchors each after its merchant mention.
  - Deposit/withdrawal tools → one merged transaction list (`transactionListCard` + `mergeTransactionListCards`), but only for recent/all-transaction prompts (`shouldInferTransactionList`); ranked, category, and merchant-filtered prompts skip the raw list so unrelated rows never render.
  - `insight_top_transactions` → one transaction list (`transactionListCard` + `mergeTransactionListCards`); its rows are already the exact ranked/filtered set.
  - `insight_spending_breakdown` → one pie (`spendingPieCard`), choosing the latest complete month, top 5 categories, and an `Other` rollup.
  - `insight_upcoming_bills` → one bill (`billCard`), choosing the largest amount and earliest due date on a tie, then anchoring after the payee mention.
  - Single-account payloads → one account card (`accountCard`), anchored after the nickname (or type). An account list returns null; prose answers.
  - `nessie_list_account_loans` → one loan card (`loanCard`), choosing the largest balance and anchoring after the type.
  - `find_nearby_atms` / `find_nearby_branches` → one location card (`locationCard`), taking the first result and anchoring after its name.
  - `insight_recurring_charges` → one recurring-charge card (`recurringCard`), choosing the largest average amount and anchoring after the description.
  - Account lists or `insight_financial_overview` on a rewards prompt → one reward card (`rewardCard`): the highest credit-account reward, or the positive overview total, anchored after its label.
  - `insight_goal_projection` → one goal card (`goalCard`), showing target/current/months/projected date without anchoring to a name.
  - `insight_financial_overview` on a cashflow or overview prompt → one monthly cashflow card (`cashflowCard`), choosing the latest complete month and anchoring after its period.
- Selection priority when `present_card` lands: explicit references → query intent → recency, capped at 1–2. If nothing scores above threshold, emit no card.
- Never emit a broad “everything” card. Prefer prose over an uncertain card.

## 8. Migration plan

| Phase | Scope | Status | Acceptance | Rollback |
| --- | --- | --- | --- | --- |
| Phase 0 | Archive legacy cards; chat prose-only; add plan | Shipped | App builds; no app import of archived components | Revert commit |
| Phase 1 | `EntityCard` schema, per-kind normalizers, `present_card`, ownership validation, `card` SSE event, flag (`off` / `v2`) | Shipped | Flag off matches current behavior; flag v2 emits normalized events the existing renderer already handles; ownership rejects cross-customer and missing-account ids | Flag to `off` |
| Phase 2 | First cards: `TransactionCard`, `TransactionListCard`, `SpendingPieCard`, `BillCard`, `AccountCard` | Transaction cards, transaction list, pie, bill, account, loan, location, and recurring cards shipped; remaining Phase 3 cards planned | Cards appear inline with correct contrast; one transaction card per anomaly finding (cap 8), other cards 1–2 per turn; no fallback; bills/accounts/loans/locations/recurring show one entity only | Revert slice |
| Phase 3 | Remaining cards: loan, location, recurring, reward, goal, cashflow | All shipped, including reward, goal, and cashflow | Each kind is primitive, accessible, and theme-safe | Revert slice |
| Phase 4 | Remove legacy registry/relevance coupling; migrate follow-ups to `EntityCard`; rewrite stale E2E card assertions | Shipped | No legacy card-kind rendering paths remain; follow-ups consume `EntityCard[]`; E2E helpers/specs target primitive selectors | Revert commit |

Phase 2 slice refinements already shipped:

- Cards carry no reason/flag tags. The prose explains every card and names each flagged merchant, explaining the pattern without restating card values.
- Merchant-mention inference re-anchors each transaction card after the mention, including a trailing colon/comma.
- A compact loading line remains visible for the whole pending turn.
- Deposit and withdrawal results merge into one list card, capped at 8 visible rows with “N more transactions”.
- The spending pie is a standalone primitive: latest complete month, top 5 plus `Other`, period plus percentage legend, no analysis inside the card.
- Bill and account cards are single-entity primitives: one largest bill, one account only. `insight_upcoming_bills` never renders a bills list; an all-accounts payload renders no card. Totals, coverage, and comparisons stay in the prose.
- Loan, location, and recurring cards are single-entity primitives: one loan (largest balance), the first location result, and one recurring charge (largest average). Cadence, next date, distance, and ATM street addresses are absent from the source data and therefore absent from the cards.
- Reward, goal, and cashflow cards are single-value primitives: one reward balance (highest credit-account rewards or overview total), one goal projection (target/current/months/projected date), and one cashflow month (latest complete, with a signed net). Comparisons, progress narratives, and advice stay in the prose, and points are never converted into an invented dollar value.
- The ClimateWise card is one inline snapshot: score and tier with a gauge, total kg CO₂e over the window, and a link to the full `/climatewise` page. The MCP `insight_climatewise` tool returns the shared report, `/api/climate` delegates to it, and prose explains the score’s meaning plus the biggest category and nudge without restating card values.

## 9. Tests and verification

Unit (`vitest`):

- Normalizers: valid/invalid payloads, field whitelisting, ids, caps, dedupe, fallbacks.
- Placement and buffering: `afterText` order, markdown-span safety, pending vs done reveal.
- Pie: latest complete month selection, top-5 plus `Other`, share normalization, empty/malformed payload, period formatting, non-transaction cards untouched by transaction anchoring and merging.
- Bill: largest selection, earliest-due tie-break, field whitelist, missing/zero/negative amount handling, empty payee, malformed payloads, stable id fallback, payee anchoring.
- Account: single row vs list (list returns null), id/type requirements, masking, rewards/balance normalization, context customer id, `accountHref`, nickname/type anchoring.
- Loan: largest-balance selection, type tie-break and description fallback, id/label requirements, field whitelist (no credit score), context customer id, type anchoring.
- Location: first-result selection, branch address composition, ATM empty address, hours joining, id/name requirements, malformed payloads, name anchoring.
- Recurring: largest-average selection, stable `description|amount` charge id, missing months/average normalization, description requirement, malformed payloads, description anchoring.
- Reward: highest credit-account rewards selection, nickname/type fallback, zero/non-credit rewards ignored, overview total fallback, no invented dollar value, malformed payloads, label anchoring.
- Goal: projection parsing, target/current validation, `monthsToTarget` null/zero/negative handling, projected-date month arithmetic, no advice fields, malformed payloads, no name anchoring.
- Cashflow: latest complete month, last-entry fallback, net fallback from inflow minus outflow, malformed rows, empty payloads, period formatting, period anchoring.
- Merchant: first-valid selection from a list or single record, id/name requirements, address composition (`street, city, state`, no zip), optional category/address, malformed payloads, name anchoring.
- Profile: single-row vs list (list returns null), name join, city/state-only location, street/zip/contact/identifier field whitelist, missing id/name, malformed payloads, name and first-name fallback anchoring.
- ClimateWise: direct report and `{ report }` payloads, score/tier/totalKg validation, days fallback, derived `topCategory`, optional annualized/benchmark values, context customer id, and malformed payloads.
- Prompt: primitive-card language, the single-bill/single-account rule, the single-loan/location/recurring-charge/reward/goal/cashflow/merchant/profile/climatewise rule, the spending intro/takeaway rule, and rule 14 for `present_card`.
- `present_card`: candidate collection per tool, duplicate collapsing, ownership acceptance/rejection (cross-customer and missing account), unknown id, kind mismatch, profile/customer id, whitelist normalization, and the agent integration (normalized `card` event with `afterText`, no MCP call for `present_card`, rejected declarations).
- Payload helpers (`payloads.test.ts`): `asItems` list shapes, single-record wrapping, wrapper-only payloads, non-record filtering; `asRecord` fallbacks.
- Intents (`intents.test.ts`): union of mentioned intents, empty/unknown/malformed prompts.
- Follow-ups (`followUps.test.ts`): `EntityCard` kind → topic matrix, prompt exclusion, dedupe, 3–4 cap, no-card intent fallback, generic fallback, malformed input never throws.

E2E (`e2e/chat.spec.ts`, Playwright; current policy forbids running it):

- Text → card → text ordering in a real turn.
- One entity only; no fallback or legacy `.chat-card`.
- Pie renders `.pie-chart-card`, wedge paths, a category legend, and a period; no editorial labels.
- Bill prompts render one `.bill-card` with payee, amount, due date, and status, and no legacy `.chat-card`.
- Account-list prompts render no account list; a single-account payload renders `.account-card` with a deep link.
- Loan prompts render one `.loan-card` (type, balance, payment, status) and no legacy `.chat-card`.
- ATM prompts render one standalone `.atm-locator-card` (not inside `.bubble.assistant`) with a name, hours, and a server-proxied Mapbox Static Images `<img>` whose `src` starts `/api/mapbox/static?` (no `access_token` or `mapbox.com` in the DOM, and no OpenStreetMap iframe or “Open in OpenStreetMap” link). The `.atm-actions` row is outside the `.entity-card` map surface and outside the prose bubble, with two equal-width “Open in Apple Maps”/“Open in Google Maps” buttons at about half the card width each (text-only, no icons, at least 44px tall, with a link-tinted background highlight on hover/focus instead of an underline) (or the “Map preview unavailable” fallback). Branch prompts still render one inline `.location-card` with a name and an address.
- Recurring prompts render one `.recurring-card` with description, average amount, months seen, and last date; no cadence or next-date copy.
- Rewards prompts render one `.reward-card` with a label and points; no invented dollar value and no legacy `.chat-card`.
- Goal prompts render one `.goal-card` with target/current/months/projected date; no on-track or advice copy.
- Cashflow or overview prompts render one `.cashflow-card` with period, inflow, outflow, and signed net; no interpretation.
- Merchant prompts render one `.merchant-card` with one name, optional category, and optional address; no legacy `.chat-card`, merchant list, amount, or count.
- Profile prompts render one `.profile-card` with name and city/state only; no street, zip, contact, or identifier fields.
- ClimateWise prompts render one inline `.climatewise-card` with score, tier, total kg, window, and a `/climatewise?customer=…` link; the prose does not repeat the card values.
- Merchant cards render inline inside the assistant bubble and stay buffered until the prose reaches the merchant name.
- Buffered cards appear only after the prose reaches their anchor.
- Theme contrast, reduced motion, accessibility names, and deep-link navigation.

Accessibility:

- Cards expose an accessible name; decorative icons are `aria-hidden`; status is never conveyed by colour alone; the pie SVG has `role="img"` and a summary `aria-label`.

Security:

- Only whitelisted fields reach the SSE payload and DOM. No raw tool payloads, full account numbers, or extra PII. `present_card` ownership validation is mandatory and ships enabled by default (`CARDS_MODE=v2`).

Live checks:

- `/api/health` and `/chat` return 200.
- An optional SSE probe confirms a spending insight produces a `spending-pie` payload with period, slices, and normalized shares.

Current verification commands: `npm run check`, `npm test`, `npm run build`. Browser E2E is intentionally skipped.

## 10. How to add a primitive card

1. **Define the primitive.** Decide the one entity or basic series the card shows; reject anything broad or interpretive.
2. **Normalize the payload.** Add a whitelisted interface and a pure builder in `src/lib/chat/entityCards.ts`. Never pass raw tool records through.
3. **Assign identity and placement.** Choose a stable `entityId`, accept `afterText`, and set a finite `id`. Add the card to the `EntityCard` union.
4. **Unit-test the builder.** Cover valid, empty, malformed, caps, dedupe, and never-throw behavior.
5. **Build the component.** Use `CardFrame` for every card; single-entity cards are restyled inside the assistant bubble (no lift, tight radius), while `transaction-list`/`spending-pie` keep the standalone frame. Keep it theme-agnostic with tokens or a fixed accessible palette. No titles, rankings, or recommendation copy.
6. **Wire the renderer.** Add the `kind` branch to `ChatCardView.svelte` and route blocks through `groupInlineCards` in `ChatPanel.svelte`. Ensure standalone series cards flush the inline group rather than being folded into the bubble.
7. **Add a deep link only if the entity has a real destination.** Omit the link when ids are incomplete.
8. **Verify placement.** Confirm `anchorTransactionCards` leaves the card alone (or anchors it explicitly), buffering works while pending, and markdown offsets cannot split the prose.
9. **Update the prompt.** Add a short intro/takeaway rule if the card needs framing; keep the analysis and next step in prose, without `Insight:`/`Tip:` labels.
10. **Test and commit.** Run unit tests, `npm run check`, and `npm run build`; update E2E but do not run Playwright under current policy; update this plan.

## 11. Risks and open questions

- **Model compliance:** the model may not call `present_card`; strong prompt rules plus fallback builders and telemetry are needed.
- **Inference accuracy:** reference matching can pick the wrong entity. Prefer omitting a card over showing a wrong or broad one.
- **Card volume:** anomaly findings get one inline card each (cap 8); other cards cap at 1–2. Dedupe by `entityId`, and suppress cards in pure list answers. The old 1–2 cap was a layout budget, not a limit on flagged findings.
- **Cross-customer leakage:** ownership validation is mandatory; reject and log cross-customer ids.
- **List vs prose:** when does a multi-row answer deserve a list card? Current exception is transaction lists; revisit with telemetry.
- **Fast path vs Gemini:** deterministic narration must obey the same no-repeat and insight/tip rules as the model path.
- **Model compliance with `present_card`:** the model may not call it. Prompt rule 14 pushes for it, but client-side inference remains wired and conservative, so every existing card still appears without the tool.
- **`present_card` ownership:** account/bill/loan/transaction/profile declarations are rejected unless the entity belongs to the session customer; merchant and location are public reference data.
- **`Other` semantics:** the pie rollup is a display simplification, not an insight; the prose should explain anything meaningful about the remainder.

## 12. File map

Active components and UI:

- `src/routes/[view=wallet]/inline-cards/CardFrame.svelte`
- `src/routes/[view=wallet]/inline-cards/OpenIcon.svelte`
- `src/routes/[view=wallet]/inline-cards/primitives/` — `MoneyText.svelte`, `DateText.svelte`, `AccountTag.svelte`, `ProgressMeter.svelte`, `ShareBar.svelte`, `DeltaBadge.svelte`, `Sparkline.svelte`, `InlineAction.svelte`, `TruncationFooter.svelte`, `InlineEmpty.svelte`, `ExpandRow.svelte`, `DefinitionHint.svelte`, `BufferedPlaceholder.svelte`
- `src/routes/[view=wallet]/inline-cards/TransactionCard.svelte`
- `src/routes/[view=wallet]/inline-cards/TransactionListCard.svelte`
- `src/routes/[view=wallet]/inline-cards/PieChartCard.svelte`
- `src/routes/[view=wallet]/inline-cards/StatusChip.svelte`
- `src/routes/[view=wallet]/inline-cards/BillCard.svelte`
- `src/routes/[view=wallet]/inline-cards/AccountCard.svelte`
- `src/routes/[view=wallet]/inline-cards/LoanCard.svelte`
- `src/routes/[view=wallet]/inline-cards/LocationCard.svelte`
- `src/routes/[view=wallet]/inline-cards/RecurringChargeCard.svelte`
- `src/routes/[view=wallet]/inline-cards/EntityKeyValue.svelte`
- `src/routes/[view=wallet]/inline-cards/RewardCard.svelte`
- `src/routes/[view=wallet]/inline-cards/GoalCard.svelte`
- `src/routes/[view=wallet]/inline-cards/CashflowPointCard.svelte`
- `src/routes/[view=wallet]/ChatPanel.svelte`
- `src/routes/[view=wallet]/FollowUps.svelte`
- `src/lib/components/Eno.svelte`
- `src/lib/components/EnoThinking.svelte`

Client libraries:

- `src/lib/chat/primitives.ts`
- `src/lib/chat/primitives.test.ts`
- `src/lib/chat/entityCards.ts`
- `src/lib/chat/entityCards.test.ts`
- `src/lib/chat/inline.ts`
- `src/lib/chat/inline.test.ts`
- `src/lib/chat/thinking.ts`
- `src/lib/chat/payloads.ts` — shared `isRecord`/`asItems`/`asRecord` payload helpers
- `src/lib/chat/payloads.test.ts`
- `src/lib/chat/intents.ts` — `Intent` and `classifyIntents` (no card-relevance filtering)
- `src/lib/chat/intents.test.ts`
- `src/lib/chat/followUps.ts` — `followUpsFor(EntityCard[], prompt)`
- `src/lib/chat/followUps.test.ts`
- `src/lib/format.ts`

Server:

- `src/lib/server/prompts.ts`
- `src/lib/server/prompts.test.ts`
- `src/lib/server/events.ts`
- `src/lib/server/agent.ts`
- `src/lib/server/presentCard.ts`
- `src/lib/server/presentCard.test.ts`
- `src/lib/server/cardsMode.ts`
- `src/lib/server/env.ts`
- `src/lib/server/geo.ts`
- `src/lib/server/geo.test.ts`
- `src/lib/chat/osm.ts`
- `src/lib/chat/osm.test.ts`
- `src/lib/server/mockAgent.ts`
- `src/lib/server/toolBridge.ts`
- `src/lib/server/nessie/tools/insights.ts`
- `src/routes/api/chat/+server.ts`

Archived (do not use):

- `src/lib/chat/archive/legacy-cards/` (18 components plus the archive-only `cards.ts` registry and README; active app code no longer imports any of it)

Plans and tests:

- `CARD_PLAN.md` (this document)
- `docs/plans/inline-entity-cards.md` (pointer)
- `e2e/chat.spec.ts`
- `e2e/helpers.ts`
