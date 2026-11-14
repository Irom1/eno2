# Inline entity cards

Status: Phase 0 shipped (legacy cards archived, chat prose-only). The first Phase 2 slice is implemented: anomaly findings render as inline single-transaction cards (1–2 per turn), while all other legacy cards stay archived.
Owner: Eno 2.0 chat.

## 1. Problem

The legacy chat cards (`src/lib/chat/archive/legacy-cards/`, archived in Phase 0) rendered **one broad card per tool result**. Concretely:

- They dumped entire tool payloads — full transaction lists, all accounts, all bills — rather than the entity the assistant was discussing.
- They included a `FallbackCard`/broad "covers every outcome" card that could render for any result, so nearly every turn produced a card.
- They repeated redundant titles and counts already stated in the prose ("3 accounts", "Transactions").
- They were not tied to a specific entity, so a card could show unrelated rows while the prose talked about one merchant or one bill.

The result was noisy cards that competed with the narrative instead of reinforcing it, and no reliable way to say "this card is the thing the assistant just mentioned".

## 2. Goal

Render **inline, single-entity cards placed between prose segments**, selected from the user's question and the assistant's explicit references:

- Text carries the narrative. Cards carry a precise entity (one transaction, one bill, one account, …).
- At most **1–2** cards per turn. No catch-all card. Lists remain prose/bullets.
- Placement is anchored to the assistant text offset where the entity is referenced (typically intro → card → takeaway).

## 3. Card taxonomy and payloads

Every card is a **whitelisted, normalized** view model. One entity id per card. No raw tool payloads reach the client.

| Card | Entity | Payload fields |
| --- | --- | --- |
| `TransactionCard` | one transaction | `description`, `merchant?`, `amount`, `date`, `status`, `accountName?` |
| `BillCard` | one bill | `payee`, `amount`, `dueDate`, `status`, `covered: boolean` |
| `AccountCard` | one account | `nickname`, `type`, `maskedNumber`, `balance?`, `rewards?` |
| `LoanCard` | one loan | `type`, `balance`, `monthlyPayment`, `status` |
| `SpendingCategoryCard` | one category | `name`, `amount`, `share`, `period` |
| `LocationCard` | one ATM/branch | `name`, `address`, `distance` |
| `RewardCard` (later) | one reward balance/offer | `label`, `points`, `value?` |
| `CashflowPointCard` (later) | one month/point | `period`, `inflow`, `outflow` |

Explicitly **not** in the taxonomy: `overview`, `accounts` list, `fallback`, "More information". Any multi-entity answer is prose/bullets, optionally with a single representative entity card.

## 4. Data model

```ts
type EntityKind =
  | 'transaction' | 'bill' | 'account'
  | 'loan' | 'category' | 'location';

interface EntityCardBase {
  kind: EntityKind;
  entityId: string;      // stable id owned by the session's customer
}

type EntityCard =
  | (EntityCardBase & { kind: 'transaction'; payload: TransactionPayload })
  | (EntityCardBase & { kind: 'bill'; payload: BillPayload })
  | (EntityCardBase & { kind: 'account'; payload: AccountPayload })
  | (EntityCardBase & { kind: 'loan'; payload: LoanPayload })
  | (EntityCardBase & { kind: 'category'; payload: CategoryPayload })
  | (EntityCardBase & { kind: 'location'; payload: LocationPayload });

interface InlineCardEvent {
  card: EntityCard;
  anchor: 'after-text';
  afterText: number;     // character offset into the current assistant text
}

type MessageBlock =
  | { type: 'text'; text: string }
  | { type: 'card'; card: EntityCard };
```

Placement reuses the existing primitive:

- Server emits `afterText` = current accumulated text length when the card is produced.
- Client uses `inlineBlocks(text, cards)` (`src/lib/chat/inline.ts`) to split prose into `text`/`card` blocks. This helper already exists and is unchanged in Phase 0.
- Intended rhythm: assistant writes an intro ending in a colon, the card is anchored there, then the takeaway follows after it.

## 5. Inference and selection pipeline

**Preferred: explicit read-only tool.**

```ts
present_card({ kind: 'transaction' | 'bill' | 'account' | 'loan' | 'category' | 'location', id: string })
```

1. The model resolves the entity through its normal data tools, then calls `present_card` when it is about to reference that entity.
2. The server validates `id` against the session allowlist/customer (ownership check) and that the payload matches `kind`.
3. The server builds the normalized payload and emits a `card` SSE event with `afterText` = current text length.
4. The model continues with the takeaway text.

The tool is read-only and idempotent; it does not fetch data itself, it only declares "present this entity".

**Fallback selector (only if the model never calls `present_card`).**

- Candidate entities come from the tool results in this turn.
- Rank by: explicit references in the answer (merchant/description, amount, last-4, id) > query intent (bill question → bills, spend question → categories/merchants) > recency.
- Hard cap 1–2 cards; if nothing scores above a threshold, emit **no card** (never a broad card).
- Deduplicate by `entityId`; no entity repeats within a turn.

## 6. Server / agent changes

- Add a card builder/normalizer per entity kind (pure functions, unit-testable):
  `buildTransactionCard(customer, txn)`, `buildBillCard`, etc. Unknown/missing fields are omitted, not passed through.
- Ownership validation: every `entityId` must belong to the session's customer; reject cross-customer ids and log a telemetry counter.
- SSE schema: new `card` event, `data = { kind, entityId, payload, afterText }`. Existing `insight` events remain during migration; the client ignores them for rendering.
- Prompt rule: "When you are about to mention one specific entity, call `present_card` before the sentence that refers to it. Follow with the takeaway. Never call it for list answers."
- Fallback/mock agent: emit exactly one demo `TransactionCard` so development and screenshots work without a live model.

## 7. Client changes

- New `InlineCardRenderer.svelte` switching on `card.kind` to one component per entity: `TransactionCard`, `BillCard`, `AccountCard`, `LoanCard`, `SpendingCategoryCard`, `LocationCard`.
- Shared `CardFrame.svelte`: keeps the existing contrast treatment (background/border tokens, dark/light variants), **no title, no count, no fallback**.
- ChatPanel renders `MessageBlock[]` from `inlineBlocks(message.text, message.cards)`: text block → markdown bubble, card block → renderer. No `filterCardDuplication` for card blocks (text may repeat the entity on purpose); dedupe only within the card list by `entityId`.
- Remove the legacy `ChatCardRenderer` import path from app code (done in Phase 0 by archiving).

## 8. Migration phases

**Phase 0 — this commit.**
Archive legacy cards under `src/lib/chat/archive/legacy-cards/`, make chat prose-only, add this plan, keep data collection for follow-ups.
Acceptance: app builds, chat renders full prose with no cards, no app import of archived components. Rollback: revert the commit.

**Phase 1 — schema + tool + tests, behind a flag.**
`EntityCard`/`InlineCardEvent` types, per-kind normalizers, `present_card` tool, server validation and `card` SSE event. Feature flag `cards: 'off' | 'v2'` (default `'off'`). Unit tests for schema, ownership, and payload normalization.
Acceptance: flag off = identical to Phase 0; flag v2 = events emitted but renderer stub. Rollback: flag to `'off'`.

**Phase 2 — first three cards.**
`TransactionCard`, `BillCard`, `AccountCard` and `InlineCardRenderer`/`CardFrame`. Wire block rendering.
First slice shipped: `CardFrame` + `TransactionCard` render `insight_anomalies` findings as 1–2 single-transaction cards via `entityCards.ts` + the generic `inlineBlocks<T>`. `BillCard` and `AccountCard` remain next.

Slice refinements:

- Cards carry no reason/flag tags: they show only the merchant, date, and amount. The prose names the entity and explains why it stands out, and the payload keeps `flag`/`duplicateOf` only for inference.
- Merchant-mention inference (`anchorTransactionCards`) re-anchors each card after the merchant's mention in the prose (including a trailing colon/comma), falling back to the existing end-of-text offset when no mention exists. This is a client-side fallback; the future `present_card` tool remains the precise mechanism.
- A compact loading line stays visible for the whole pending turn, including after prose and cards have started streaming. The full thinking checklist still clears once blocks render.
- Exception to "lists stay prose": a multi-transaction answer may render one `TransactionListCard` with row data (description, date, status, amount). Deposits and withdrawals in the same turn merge into that single card. Rows are capped at 8 visible, with a "N more" hint; the prose introduces the list without repeating row amounts or dates.
Acceptance: single-entity cards appear inline between prose segments; at most 2 per turn; no fallback. Rollback: flag off.

Placement rule for this slice: if a card arrives before any prose (no intro yet), anchor it at end-of-text so the answer reads first and the source card(s) follow the claim; if prose precedes the insight, anchor inline at that offset.

**Phase 3 — remaining cards.**
`LoanCard`, `SpendingCategoryCard`, `LocationCard`; enable `v2` by default.
Acceptance: each kind renders with correct contrast in light/dark; lists remain prose. Rollback: flag off.

**Phase 4 — remove legacy coupling.**
Remove the legacy registry/relevance coupling (`cards.ts`, relevance), update follow-ups to read `EntityCard`, rewrite/remove stale legacy E2E card assertions.
Acceptance: no references to legacy card kinds remain; follow-ups work from `EntityCard`. Rollback: revert commit.

## 9. Test plan

**Unit (vitest):**
- Schema validation: valid/invalid payloads per kind; unknown fields rejected.
- Id ownership: cross-customer ids rejected; missing ids rejected.
- Selection/ranking: explicit reference beats intent beats recency; low confidence → no card.
- Dedupe/caps: duplicate entity ids collapse; >2 candidates truncated to 2.
- Placement: `afterText` offsets produce expected text/card block order; card at start/end/middle.

**E2E (only when policy allows; never in Phase 0):**
- Inline text → card → text order in a real turn.
- Single entity only; no fallback card rendered for list answers.
- Theme contrast (light/dark) for each card.
- Reduced-motion does not affect static cards.

**Accessibility:** card has an accessible name from the entity; decorative icons `aria-hidden`; no color-only status; alt text on any imagery.

**Security:** no raw tool payloads or extra PII in the SSE `card` payload or DOM; assert only whitelisted fields serialize.

## 10. Risks / open questions

- **Model compliance:** the model may not call `present_card`. Mitigation: strong prompt rule + fallback selector + telemetry on missed calls.
- **Fallback accuracy:** reference matching can be wrong; prefer omitting a card over showing the wrong one.
- **Card volume:** cap at 1–2, dedupe by id, and suppress cards in pure list answers.
- **Cross-customer leakage:** ownership validation is mandatory and must be tested; failure logs and drops the card.
- **List vs card policy:** when should a multi-row answer show one representative card versus none? Start with none; revisit with telemetry.
- **Telemetry:** track card kind, source (`present_card` vs fallback), and placement offset to tune selection and decide on later kinds (`RewardCard`, `CashflowPointCard`).
- **Follow-ups:** they currently derive from legacy card kinds; Phase 4 must migrate them to `EntityCard` without regressing suggestions.
