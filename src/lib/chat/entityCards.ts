/**
 * Client-safe inline entity-card models and normalizers.
 * Pure functions only: no server or DOM imports.
 */

export interface TransactionCardPayload {
  description: string;
  amount: number | null;
  date: string;
  flag: 'duplicate' | 'unusual';
  duplicateOf?: string;
}

export interface TransactionEntityCard {
  id: number;
  entityId: string;
  kind: 'transaction';
  payload: TransactionCardPayload;
  afterText?: number;
}

export type EntityCard = TransactionEntityCard;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function normalizeCap(cap: number): number {
  if (typeof cap !== 'number' || !Number.isFinite(cap)) return 2;
  return Math.max(0, Math.floor(cap));
}

function descriptionOf(value: unknown): string {
  if (typeof value !== 'string') return 'Recent charge';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'Recent charge';
}

function amountOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function dateOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function entityIdFor(type: string, payload: TransactionCardPayload): string {
  const amountKey = payload.amount === null ? 'null' : String(payload.amount);
  return `${type}|${payload.description}|${payload.date}|${amountKey}`;
}

/**
 * Normalize insight_anomalies findings into at most `cap` single-transaction
 * cards. Malformed payloads and entries are skipped rather than thrown on.
 */
export function anomalyTransactionCards(
  payload: unknown,
  afterText: number,
  startId: number,
  cap = 2
): EntityCard[] {
  const limit = normalizeCap(cap);
  if (limit === 0) return [];

  try {
    if (!isRecord(payload) || !Array.isArray(payload.findings)) return [];
    const findings = payload.findings;

    const cards: EntityCard[] = [];
    const seen = new Set<string>();

    for (let index = 0; index < findings.length; index += 1) {
      if (cards.length >= limit) break;
      const finding = findings[index];
      if (!isRecord(finding)) continue;

      const type = typeof finding.type === 'string' ? finding.type : '';
      const flag = type === 'duplicate' ? 'duplicate' : 'unusual';
      const description = descriptionOf(finding.description);
      const amount = amountOf(finding.amount);
      const date = dateOf(finding.date);
      const payload: TransactionCardPayload = { description, amount, date, flag };

      if (typeof finding.duplicateOf === 'string') {
        payload.duplicateOf = finding.duplicateOf;
      }

      const explicitId =
        typeof finding._id === 'string' || typeof finding._id === 'number'
          ? String(finding._id)
          : '';
      const entityId = explicitId || entityIdFor(type || 'unusual', payload);

      if (seen.has(entityId)) continue;
      seen.add(entityId);

      cards.push({
        id: startId + cards.length,
        entityId,
        kind: 'transaction',
        payload,
        afterText
      });
    }

    return cards;
  } catch {
    return [];
  }
}

/**
 * Merge by entityId, preserve first occurrence order, cap the total.
 * Malformed entries are ignored.
 */
export function mergeEntityCards(
  existing: EntityCard[],
  incoming: EntityCard[],
  cap = 2
): EntityCard[] {
  const limit = normalizeCap(cap);
  if (limit === 0) return [];

  const merged: EntityCard[] = [];
  const seen = new Set<string>();

  const add = (cards: unknown): void => {
    if (!Array.isArray(cards)) return;
    for (const card of cards) {
      if (merged.length >= limit) return;
      if (!isRecord(card)) continue;
      if (typeof card.entityId !== 'string') continue;
      if (seen.has(card.entityId)) continue;
      seen.add(card.entityId);
      merged.push(card as unknown as EntityCard);
    }
  };

  try {
    add(existing);
    add(incoming);
  } catch {
    return merged;
  }

  return merged;
}
