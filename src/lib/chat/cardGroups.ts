/**
 * Client-safe grouping of inline chat blocks for rendering.
 *
 * Single-entity cards render inline inside the assistant prose bubble; the
 * multi/series cards (`transaction-list`, `spending-pie`) render as standalone
 * framed cards. This helper only rearranges blocks, preserving order and card
 * identity, so the panel can interleave the two presentations.
 *
 * Pure functions only: no server or DOM imports.
 */
import type { EntityCard } from './entityCards.js';
import type { InlineBlock } from './inline.js';

export type InlineRenderGroup =
  | { type: 'inline'; blocks: InlineBlock<EntityCard>[] }
  | { type: 'card'; card: EntityCard };

/** Kinds that stay standalone rather than folding into the prose bubble. */
const STANDALONE_KINDS: ReadonlySet<EntityCard['kind']> = new Set([
  'transaction-list',
  'spending-pie'
]);

export function isInlineCardKind(kind: EntityCard['kind']): boolean {
  return !STANDALONE_KINDS.has(kind);
}

/**
 * Split ordered inline blocks into render groups. Text and single-entity cards
 * accumulate into one inline group; a standalone card flushes the current
 * inline group, emits its own `card` group, and later text/cards start a new
 * inline group. Empty text blocks are skipped and malformed input never throws.
 */
export function groupInlineCards(
  blocks: InlineBlock<EntityCard>[]
): InlineRenderGroup[] {
  try {
    if (!Array.isArray(blocks)) return [];

    const groups: InlineRenderGroup[] = [];
    let current: InlineBlock<EntityCard>[] = [];

    const flush = (): void => {
      if (current.length > 0) {
        groups.push({ type: 'inline', blocks: current });
        current = [];
      }
    };

    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue;

      if (block.type === 'text') {
        if (typeof block.text === 'string' && block.text.trim().length > 0) {
          current.push({ type: 'text', text: block.text });
        }
        continue;
      }

      if (block.type !== 'cards' || !Array.isArray(block.cards)) continue;

      let inlineCards: EntityCard[] = [];
      const flushInlineCards = (): void => {
        if (inlineCards.length > 0) {
          current.push({ type: 'cards', cards: inlineCards });
          inlineCards = [];
        }
      };

      for (const card of block.cards) {
        if (!card || typeof card !== 'object') continue;

        if (isInlineCardKind(card.kind)) {
          inlineCards.push(card);
          continue;
        }

        flushInlineCards();
        flush();
        groups.push({ type: 'card', card });
      }

      flushInlineCards();
    }

    flush();
    return groups;
  } catch {
    return [];
  }
}
