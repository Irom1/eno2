import { describe, expect, it } from 'vitest';
import type { ChatCard } from './cards.js';
import { inlineBlocks, type InlineBlock } from './inline.js';

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
});
