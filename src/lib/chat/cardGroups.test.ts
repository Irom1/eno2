import { describe, expect, it } from 'vitest';
import type { EntityCard } from './entityCards.js';
import type { InlineBlock } from './inline.js';
import { groupInlineCards, isInlineCardKind, type InlineRenderGroup } from './cardGroups.js';

function single(id: number): EntityCard {
  return {
    id,
    entityId: `bill:${id}`,
    kind: 'bill',
    payload: { billId: String(id), payee: 'Test utility', amount: 65.59, dueDate: '2026-11-20' }
  };
}

function list(id: number): EntityCard {
  return {
    id,
    entityId: 'transaction-list',
    kind: 'transaction-list',
    payload: { rows: [], more: 0 }
  };
}

function pie(id: number): EntityCard {
  return {
    id,
    entityId: 'spending-pie',
    kind: 'spending-pie',
    payload: { period: 'October 2026', total: 100, slices: [{ label: 'Food', amount: 100, share: 1 }] }
  };
}

function text(value: string): InlineBlock<EntityCard> {
  return { type: 'text', text: value };
}

function cards(...entries: EntityCard[]): InlineBlock<EntityCard> {
  return { type: 'cards', cards: entries };
}

/** Flatten a group into a comparable shape for readability. */
function shape(groups: InlineRenderGroup[]): unknown[] {
  return groups.map((group) => {
    if (group.type === 'card') return { card: group.card.id };
    return {
      inline: group.blocks.map((block) =>
        block.type === 'text' ? { text: block.text } : { cards: block.cards.map((c) => c.id) }
      )
    };
  });
}

describe('groupInlineCards', () => {
  it('keeps text-only content in one inline group', () => {
    expect(shape(groupInlineCards([text('Hello'), text('world')]))).toEqual([
      { inline: [{ text: 'Hello' }, { text: 'world' }] }
    ]);
  });

  it('folds a single-entity card into the same inline group as the text', () => {
    expect(shape(groupInlineCards([text('Your bill: '), cards(single(1))]))).toEqual([
      { inline: [{ text: 'Your bill: ' }, { cards: [1] }] }
    ]);
  });

  it('keeps multiple single-entity cards together in one inline group', () => {
    expect(
      shape(groupInlineCards([text('Here: '), cards(single(1)), cards(single(2)), text('thanks')]))
    ).toEqual([{ inline: [{ text: 'Here: ' }, { cards: [1] }, { cards: [2] }, { text: 'thanks' }] }]);
  });

  it('splits around a transaction list while keeping later singles inline', () => {
    expect(
      shape(
        groupInlineCards([
          text('Recent: '),
          cards(list(2)),
          text('And one bill: '),
          cards(single(3))
        ])
      )
    ).toEqual([
      { inline: [{ text: 'Recent: ' }] },
      { card: 2 },
      { inline: [{ text: 'And one bill: ' }, { cards: [3] }] }
    ]);
  });

  it('emits spending pies standalone', () => {
    expect(shape(groupInlineCards([text('Spending: '), cards(pie(4))]))).toEqual([
      { inline: [{ text: 'Spending: ' }] },
      { card: 4 }
    ]);
  });

  it('splits a mixed cards block in order', () => {
    expect(shape(groupInlineCards([text('Mix: '), cards(single(1), list(2), single(3))]))).toEqual([
      { inline: [{ text: 'Mix: ' }, { cards: [1] }] },
      { card: 2 },
      { inline: [{ cards: [3] }] }
    ]);
  });

  it('returns no groups for empty input', () => {
    expect(groupInlineCards([])).toEqual([]);
  });

  it('skips empty text blocks', () => {
    expect(shape(groupInlineCards([text('   '), cards(single(1))]))).toEqual([
      { inline: [{ cards: [1] }] }
    ]);
  });

  it('never throws on malformed input', () => {
    expect(groupInlineCards(null as unknown as InlineBlock<EntityCard>[])).toEqual([]);
  });

  it('classifies standalone kinds', () => {
    expect(isInlineCardKind('transaction-list')).toBe(false);
    expect(isInlineCardKind('spending-pie')).toBe(false);
    expect(isInlineCardKind('transaction')).toBe(true);
    expect(isInlineCardKind('bill')).toBe(true);
  });
});
