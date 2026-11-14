/**
 * Client-safe splitting of assistant prose around inline entity cards.
 * Pure functions only: no server or DOM imports.
 */
import type { EntityCard } from './entityCards.js';

export interface InlineTextBlock {
  type: 'text';
  text: string;
}

export interface InlineCardsBlock<T> {
  type: 'cards';
  cards: T[];
}

export type InlineBlock<T = EntityCard> = InlineTextBlock | InlineCardsBlock<T>;

interface PlacedCard<T> {
  card: T;
  offset: number;
  index: number;
}

function clampOffset(value: unknown, length: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return length;
  return Math.min(Math.max(value, 0), length);
}

/** Markdown spans that must never be split across a card boundary. */
const CODE_SPAN = /`[^`\n]+`/g;
const BOLD_SPAN = /\*\*[^*\n]+\*\*/g;
const ITALIC_SPAN = /\*[^*\n]+\*/g;

type SpanRange = [start: number, end: number];

function findSpans(source: string, pattern: RegExp): SpanRange[] {
  const ranges: SpanRange[] = [];
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
  return ranges;
}

/** Replace span characters so later scans cannot pair markers across a span. */
function maskSpans(source: string, ranges: readonly SpanRange[]): string {
  const chars = source.split('');
  for (const [start, end] of ranges) {
    for (let index = start; index < end; index += 1) chars[index] = '\n';
  }
  return chars.join('');
}

/** Collect code, bold, then italic spans without overlapping matches. */
function markdownSpans(source: string): SpanRange[] {
  const code = findSpans(source, CODE_SPAN);
  const withoutCode = maskSpans(source, code);
  const bold = findSpans(withoutCode, BOLD_SPAN);
  const withoutCodeOrBold = maskSpans(withoutCode, bold);
  const italic = findSpans(withoutCodeOrBold, ITALIC_SPAN);
  return [...code, ...bold, ...italic];
}

/**
 * Move a card offset out of a markdown span so the splitter never leaves one
 * text block with an opening `**`/`*`/`` ` `` and the next with its closer.
 * Offsets at or outside a span boundary are returned unchanged.
 */
function safeMarkdownOffset(source: string, offset: number): number {
  const spans = markdownSpans(source);
  let safe = offset;
  let moved = true;
  while (moved) {
    moved = false;
    for (const [start, end] of spans) {
      if (safe > start && safe < end) {
        safe = end;
        moved = true;
      }
    }
  }
  return safe;
}

/**
 * Buffer inline cards until the streamed prose reaches their anchor. While a
 * turn is pending, only cards with a real offset at or before the current text
 * length are shown, so a card never renders before the text that introduces it.
 * Once the turn completes every card is returned; `inlineBlocks` then clamps
 * cards without a real anchor to the end of the text.
 */
export function revealInlineCards<T extends { afterText?: number }>(
  cards: T[],
  textLength: number,
  pending: boolean
): T[] {
  const list = Array.isArray(cards)
    ? cards.filter((card): card is T => Boolean(card) && typeof card === 'object')
    : [];

  // At `done`, reveal everything; unanchored cards render after the text.
  if (!pending) return list;

  const length =
    typeof textLength === 'number' && Number.isFinite(textLength) ? Math.max(0, textLength) : 0;

  return list.filter((card) => {
    const after = card.afterText;
    return typeof after === 'number' && Number.isFinite(after) && after <= length;
  });
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
        offset: safeMarkdownOffset(source, clampOffset(card.afterText, source.length)),
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
