/**
 * Client-safe splitting of assistant prose around inline cards (legacy chat
 * cards or normalized entity cards).
 * Pure functions only: no server or DOM imports.
 */
import type { ChatCard } from './cards.js';

export interface InlineTextBlock {
  type: 'text';
  text: string;
}

export interface InlineCardsBlock<T> {
  type: 'cards';
  cards: T[];
}

export type InlineBlock<T = ChatCard> = InlineTextBlock | InlineCardsBlock<T>;

interface PlacedCard<T> {
  card: T;
  offset: number;
  index: number;
}

function clampOffset(value: unknown, length: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return length;
  return Math.min(Math.max(value, 0), length);
}

/**
 * Split assistant text at each card's `afterText` offset. Cards without a
 * finite offset go at the end. Cards at the same offset are grouped in order.
 */
export function inlineBlocks<T extends { afterText?: number }>(
  text: string,
  cards: T[]
): InlineBlock<T>[] {
  const source = typeof text === 'string' ? text : '';

  try {
    const list = Array.isArray(cards)
      ? cards.filter((card): card is T => Boolean(card) && typeof card === 'object')
      : [];

    if (list.length === 0) {
      return source.trim() ? [{ type: 'text', text: source }] : [];
    }

    if (source.length === 0) {
      return [{ type: 'cards', cards: list.slice() }];
    }

    const placed: PlacedCard<T>[] = list
      .map((card, index) => ({
        card,
        offset: clampOffset(card.afterText, source.length),
        index
      }))
      .sort((a, b) => a.offset - b.offset || a.index - b.index);

    const blocks: InlineBlock<T>[] = [];
    let cursor = 0;
    let index = 0;

    while (index < placed.length) {
      const offset = placed[index].offset;

      if (offset > cursor) {
        const segment = source.slice(cursor, offset);
        if (segment.length > 0) blocks.push({ type: 'text', text: segment });
      }

      const group: T[] = [];
      while (index < placed.length && placed[index].offset === offset) {
        group.push(placed[index].card);
        index += 1;
      }
      blocks.push({ type: 'cards', cards: group });

      if (offset > cursor) cursor = offset;
    }

    if (cursor < source.length) {
      const tail = source.slice(cursor);
      if (tail.length > 0) blocks.push({ type: 'text', text: tail });
    }

    return blocks;
  } catch {
    // Malformed input should never break rendering.
    return source.trim() ? [{ type: 'text', text: source }] : [];
  }
}
