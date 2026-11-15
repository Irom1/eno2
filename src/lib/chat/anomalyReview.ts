import type { EntityCard, TransactionEntityCard } from './entityCards';

export const REVIEW_PAGE_SIZE = 8;
export const isDemoActivity = (description: string): boolean => /\bdemo\b/i.test(description);

export function chargeIdentity(card: EntityCard): string {
  if (card.kind === 'transaction') {
    const p = card.payload;
    return `transaction:${p.accountId ?? ''}:${p.transactionId || `${p.description}|${p.date}|${p.amount}`}`;
  }
  if (card.kind === 'recurring') return `recurring:${card.payload.accountId ?? ''}:${card.payload.chargeId}`;
  return `${card.kind}:${card.entityId}`;
}

function accountPhrase(card: TransactionEntityCard): string {
  const label = card.payload.accountLabel?.replace(/\s*·\s*Eno demo\s*$/i, '').trim();
  return label ? ` on your ${label}` : '';
}

/** One grounded reason per charge. Amounts/dates remain in the card; a baseline
 * is shown only when the detector actually returned that comparison. */
export function chargeReason(card: EntityCard): string {
  if (card.kind === 'recurring') return `${card.payload.description} appears in ${card.payload.monthsSeen} months of your history. A repeating charge is not suspicious by itself.`;
  if (card.kind !== 'transaction') return '';
  const p = card.payload;
  const name = `${p.description}${accountPhrase(card)}`;
  if (p.flag === 'duplicate') return `${name} is a possible duplicate because the same merchant charged the same amount again within three days.`;
  const comparison = p.comparisonScope === 'merchant' ? 'your usual purchases at this merchant' : p.comparisonScope === 'category' ? 'your comparable bills or purchases' : 'your recent purchases on this account';
  const baseline = typeof p.comparisonAmount === 'number' && Number.isFinite(p.comparisonAmount)
    ? ` (typically $${p.comparisonAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })})` : '';
  return `${name} is an unusually large purchase compared with ${comparison}${baseline}.`;
}

export interface ReviewMessage { text: string; inlineCards: EntityCard[]; category: 'duplicate' | 'unusual' | 'recurring' | 'empty' }

/** Stable grouping, identity-based deduplication, and an explicit eight-card
 * message boundary. Repeated names on different accounts remain distinct. */
export function chargeReviewMessages(cards: EntityCard[], complete = true): ReviewMessage[] {
  const unique = new Map<string, EntityCard>();
  for (const card of cards) {
    if (card.kind !== 'transaction' && card.kind !== 'recurring') continue;
    if (isDemoActivity(card.payload.description)) continue;
    if (card.kind === 'transaction' && !card.payload.flag) continue;
    const key = chargeIdentity(card);
    const previous = unique.get(key);
    if (!previous || (card.kind === 'transaction' && card.payload.flag === 'duplicate')) unique.set(key, card);
  }
  const messages: ReviewMessage[] = [];
  for (const category of ['duplicate', 'recurring', 'unusual'] as const) {
    const rows = [...unique.values()].filter((card) => category === 'recurring' ? card.kind === 'recurring' : card.kind === 'transaction' && card.payload.flag === category);
    for (let offset = 0; offset < rows.length; offset += REVIEW_PAGE_SIZE) {
      const intro = category === 'duplicate' ? 'These charges may be duplicates.' : category === 'recurring' ? 'These are your recurring charges, separate from unusual purchases.' : 'These charges are higher than normal.';
      let text = offset ? `More ${category === 'duplicate' ? 'possible duplicate charges' : category === 'recurring' ? 'recurring charges' : 'charges that are higher than normal'}.` : intro;
      const inlineCards = rows.slice(offset, offset + REVIEW_PAGE_SIZE).map((card) => {
        text += `\n\n${chargeReason(card)}`;
        return { ...card, afterText: text.length };
      });
      messages.push({ text, inlineCards, category });
    }
  }
  if (!messages.length) messages.push({ text: complete ? 'I didn’t find any charges that meet these unusual-activity checks.' : 'I couldn’t complete the unusual-activity review.', inlineCards: [], category: 'empty' });
  if (complete && messages[0].category === 'empty') return messages;
  const last = messages[messages.length - 1];
  last.text += !complete ? '\n\nSome accounts could not be checked, so this review is incomplete.' : messages.every((message) => message.category === 'recurring') ? '\n\nYou can review recurring charges and any subscriptions you no longer use.' : '\n\nYou can review anything you don’t recognize. These signals do not prove fraud.';
  return messages;
}
