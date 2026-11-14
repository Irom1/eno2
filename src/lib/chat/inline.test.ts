import { describe, expect, it } from 'vitest';
import type { ChatCard } from './cards.js';
import { inlineBlocks, revealInlineCards, type InlineBlock } from './inline.js';
import { renderMarkdown } from '../markdown.js';

function card(id: number, afterText?: number): ChatCard {
  return { id, kind: 'bills', tool: 'insight_upcoming_bills', payload: { id }, afterText };
}

function textBlocks(blocks: InlineBlock[]): string[] {
  return blocks
    .filter((block): block is Extract<InlineBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text);
}

function cardIds(blocks: InlineBlock[]): number[][] {
  return blocks
    .filter((block): block is Extract<InlineBlock, { type: 'cards' }> => block.type === 'cards')
    .map((block) => block.cards.map((entry) => entry.id));
}

describe('inlineBlocks', () => {
  it('returns text unchanged when there are no cards', () => {
    expect(inlineBlocks('Hello there', [])).toEqual([{ type: 'text', text: 'Hello there' }]);
  });

  it('returns no blocks when text is empty and there are no cards', () => {
    expect(inlineBlocks('', [])).toEqual([]);
  });

  it('returns one cards block when text is empty but cards exist', () => {
    const blocks = inlineBlocks('', [card(1), card(2)]);
    expect(blocks.map((block) => block.type)).toEqual(['cards']);
    expect(cardIds(blocks)).toEqual([[1, 2]]);
  });

  it('places a card at the start of the text', () => {
    const blocks = inlineBlocks('Takeaway.', [card(1, 0)]);
    expect(blocks.map((block) => block.type)).toEqual(['cards', 'text']);
    expect(textBlocks(blocks)).toEqual(['Takeaway.']);
  });

  it('places a card in the middle of the text', () => {
    const blocks = inlineBlocks('Intro. Takeaway.', [card(1, 6)]);
    expect(blocks.map((block) => block.type)).toEqual(['text', 'cards', 'text']);
    expect(textBlocks(blocks)).toEqual(['Intro.', ' Takeaway.']);
    expect(cardIds(blocks)).toEqual([[1]]);
  });

  it('places a card at the end of the text', () => {
    const blocks = inlineBlocks('Intro.', [card(1, 6)]);
    expect(blocks.map((block) => block.type)).toEqual(['text', 'cards']);
    expect(textBlocks(blocks)).toEqual(['Intro.']);
  });

  it('groups cards at the same offset while preserving their order', () => {
    const blocks = inlineBlocks('Intro. Takeaway.', [card(1, 6), card(2, 6), card(3, 6)]);
    expect(blocks.map((block) => block.type)).toEqual(['text', 'cards', 'text']);
    expect(cardIds(blocks)).toEqual([[1, 2, 3]]);
  });

  it('supports multiple offsets in stream order', () => {
    const blocks = inlineBlocks('One. Two. Three.', [card(1, 4), card(2, 9), card(3, 9)]);
    expect(blocks.map((block) => block.type)).toEqual([
      'text',
      'cards',
      'text',
      'cards',
      'text'
    ]);
    expect(textBlocks(blocks).map((text) => text.trim())).toEqual(['One.', 'Two.', 'Three.']);
    expect(cardIds(blocks)).toEqual([[1], [2, 3]]);
  });

  it('treats a missing offset as the end of the text', () => {
    const blocks = inlineBlocks('Intro.', [card(1), card(2, undefined)]);
    expect(blocks.map((block) => block.type)).toEqual(['text', 'cards']);
    expect(cardIds(blocks)).toEqual([[1, 2]]);
  });

  it('clamps negative and oversized offsets', () => {
    const negative = inlineBlocks('Intro.', [card(1, -100)]);
    expect(negative.map((block) => block.type)).toEqual(['cards', 'text']);
    expect(textBlocks(negative)).toEqual(['Intro.']);

    const oversized = inlineBlocks('Intro.', [card(1, 100)]);
    expect(oversized.map((block) => block.type)).toEqual(['text', 'cards']);
  });

  it('sorts by offset then original index, even if cards arrive out of order', () => {
    const blocks = inlineBlocks('First. Second.', [card(1, 14), card(2, 6), card(3, 6)]);
    expect(cardIds(blocks)).toEqual([[2, 3], [1]]);
    expect(textBlocks(blocks).map((text) => text.trim())).toEqual(['First.', 'Second.']);
  });

  it('returns no blocks for whitespace-only text without cards', () => {
    expect(inlineBlocks('   \n\t ', [])).toEqual([]);
  });

  it('does not throw on malformed input', () => {
    expect(inlineBlocks('hello', null as unknown as ChatCard[])).toEqual([
      { type: 'text', text: 'hello' }
    ]);
    expect(() =>
      inlineBlocks('hello', [null as unknown as ChatCard, card(1, 0)])
    ).not.toThrow();
    expect(inlineBlocks(undefined as unknown as string, [])).toEqual([]);
  });

  it('moves card offsets out of bold spans so neither text block is split', () => {
    const text = 'At **NETFLIX.COM** and **APPLE STORE**.';
    const afterNetflix = text.indexOf('NETFLIX.COM') + 'NETFLIX.COM'.length;
    const afterApple = text.indexOf('APPLE STORE') + 'APPLE STORE'.length;

    const blocks = inlineBlocks(text, [card(1, afterNetflix), card(2, afterApple)]);

    expect(blocks.map((block) => block.type)).toEqual([
      'text',
      'cards',
      'text',
      'cards',
      'text'
    ]);
    expect(textBlocks(blocks)).toEqual(['At **NETFLIX.COM**', ' and **APPLE STORE**', '.']);
    expect(cardIds(blocks)).toEqual([[1], [2]]);
    for (const block of textBlocks(blocks)) {
      const markers = block.match(/\*\*/g)?.length ?? 0;
      expect(markers % 2).toBe(0);
    }
  });

  it('does not split italic or code spans', () => {
    const text = 'See *DINER* and `SHOP`.';
    const afterItalic = text.indexOf('DINER') + 'DINER'.length;
    const afterCode = text.indexOf('SHOP') + 'SHOP'.length;

    const blocks = inlineBlocks(text, [card(1, afterItalic), card(2, afterCode)]);
    expect(textBlocks(blocks)).toEqual(['See *DINER*', ' and `SHOP`', '.']);
  });

  it('leaves offsets already outside a span unchanged', () => {
    const text = 'At **NETFLIX.COM** and more.';
    const end = text.indexOf('**', text.indexOf('NETFLIX.COM')) + 2;
    const blocks = inlineBlocks(text, [card(1, end)]);
    expect(textBlocks(blocks)).toEqual(['At **NETFLIX.COM**', ' and more.']);
  });

  it('groups multiple cards inside the same span after the span end', () => {
    const text = 'At **NETFLIX.COM**!';
    const inside = text.indexOf('NETFLIX.COM') + 3;
    const blocks = inlineBlocks(text, [card(1, inside), card(2, inside)]);
    expect(textBlocks(blocks)).toEqual(['At **NETFLIX.COM**', '!']);
    expect(cardIds(blocks)).toEqual([[1, 2]]);
  });

  it('renders the reproduction without literal bold markers', () => {
    const text =
      'I found two flagged items on your Everyday Checking account:\n\n' +
      'You have a possible duplicate charge at **NETFLIX.COM** and an unusually large purchase at **APPLE STORE**.';
    const netflix = text.indexOf('NETFLIX.COM') + 'NETFLIX.COM'.length;
    const apple = text.indexOf('APPLE STORE') + 'APPLE STORE'.length;
    const blocks = inlineBlocks(text, [card(1, netflix), card(2, apple)]);

    const html = textBlocks(blocks).map(renderMarkdown).join('');
    expect(html).toContain('<strong>NETFLIX.COM</strong>');
    expect(html).toContain('<strong>APPLE STORE</strong>');
    expect(html.replace(/<[^>]+>/g, '')).not.toContain('**');
  });
});

describe('revealInlineCards', () => {
  const cardAt = (id: number, afterText?: number) => ({ id, afterText });

  it('hides cards whose anchor is beyond the streamed text', () => {
    expect(revealInlineCards([cardAt(1, 20)], 5, true)).toEqual([]);
  });

  it('reveals a card when the text reaches its anchor', () => {
    expect(revealInlineCards([cardAt(1, 5)], 5, true)).toEqual([cardAt(1, 5)]);
    expect(revealInlineCards([cardAt(1, 4)], 5, true)).toEqual([cardAt(1, 4)]);
  });

  it('reveals every card once the turn is no longer pending', () => {
    const cards = [cardAt(1, 0), cardAt(2, 100), cardAt(3)];
    expect(revealInlineCards(cards, 3, false)).toEqual(cards);
  });

  it('keeps cards with missing or max anchors hidden while pending', () => {
    const cards = [cardAt(1), cardAt(2, Number.MAX_SAFE_INTEGER)];
    expect(revealInlineCards(cards, 1000, true)).toEqual([]);
  });

  it('shows a zero-offset card immediately', () => {
    expect(revealInlineCards([cardAt(1, 0)], 0, true)).toEqual([cardAt(1, 0)]);
  });

  it('ignores malformed card entries without throwing', () => {
    const cards = [null, undefined, cardAt(1, 3)] as unknown as Array<{ afterText?: number }>;
    expect(revealInlineCards(cards, 4, true)).toEqual([cardAt(1, 3)]);
    expect(revealInlineCards(cards, Number.NaN, true)).toEqual([]);
    expect(revealInlineCards(null as unknown as Array<{ afterText?: number }>, 4, true)).toEqual([]);
  });
});
