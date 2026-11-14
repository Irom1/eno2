import { describe, expect, it } from 'vitest';
import type { EntityCard } from './entityCards.js';
import type { InlineBlock } from './inline.js';
import { groupInlineCards, isInlineCard, isInlineCardKind, type InlineRenderGroup } from './cardGroups.js';

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

function atm(id: number): EntityCard {
  return {
    id,
    entityId: `location:atm-${id}`,
    kind: 'location',
    payload: {
      locationId: `atm-${id}`,
      name: 'Arlington ATM',
      address: '',
      type: 'atm',
      lat: 38.88,
      lng: -77.1
    }
  };
}

function branch(id: number): EntityCard {
  return {
    id,
    entityId: `location:branch-${id}`,
    kind: 'location',
    payload: {
      locationId: `branch-${id}`,
      name: 'Clarendon Branch',
      address: '3100 Clarendon Blvd, Arlington, VA',
      type: 'branch'
    }
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

  it('emits ATM location cards standalone, leaving the prose as its own inline group', () => {
    expect(shape(groupInlineCards([text('Nearby: '), cards(atm(5))]))).toEqual([
      { inline: [{ text: 'Nearby: ' }] },
      { card: 5 }
    ]);
  });

  it('keeps branch location cards inline with the prose', () => {
    expect(shape(groupInlineCards([text('Nearby: '), cards(branch(6))]))).toEqual([
      { inline: [{ text: 'Nearby: ' }, { cards: [6] }] }
    ]);
  });

  it('keeps order around a standalone ATM card', () => {
    expect(
      shape(
        groupInlineCards([
          text('Nearby: '),
          cards(single(1), atm(7), single(8)),
          text('And one bill: ')
        ])
      )
    ).toEqual([
      { inline: [{ text: 'Nearby: ' }, { cards: [1] }] },
      { card: 7 },
      { inline: [{ cards: [8] }, { text: 'And one bill: ' }] }
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

  it('classifies ATM locations as standalone and branches as inline', () => {
    expect(isInlineCard(atm(9))).toBe(false);
    expect(isInlineCard(branch(10))).toBe(true);
    expect(isInlineCard(single(11))).toBe(true);
    expect(isInlineCard(list(12))).toBe(false);
    expect(isInlineCard(pie(13))).toBe(false);
  });
});
