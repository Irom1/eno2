import type { Session } from './session';
import { anomalyTransactionCards } from '../chat/entityCards';
import { chargeReviewMessages } from '../chat/anomalyReview';

type Row = Record<string, unknown>;
const record = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
export interface TransactionReference {
  id: string;
  accountId: string;
  description: string;
  amount: number;
}
interface Evidence { name: string; data: Row; args: Row; index: number }

/** Recover actual tool evidence, rather than interpreting assistant prose or
 * guessing a transaction from a merchant keyword. Newest results come first. */
export function transactionEvidence(session: Session): Evidence[] {
  const evidence: Evidence[] = [];
  for (let index = session.contents.length - 1; index >= 0; index--) {
    for (const part of session.contents[index].parts) {
      const response = record(part.functionResponse);
      const name = String(response.name ?? '');
      if (name !== 'insight_anomalies' && name !== 'insight_top_transactions' && !/^nessie_(?:list_account_(?:transactions|withdrawals|deposits)|get_(?:withdrawal|deposit|purchase))$/.test(name)) continue;
      const result = record(response.response);
      if (!result.result) continue;
      let args: Row = {};
      for (let before = index - 1; before >= 0; before--) {
        const call = session.contents[before].parts.map((entry) => record(entry.functionCall)).find((call) => call.name === name);
        if (call) { args = record(call.args); break; }
      }
      evidence.push({ name, data: record(result.result), args, index });
    }
  }
  return evidence;
}

function references(evidence: Evidence): TransactionReference[] {
  const assessment = record(evidence.data.assessment);
  if (evidence.name === 'insight_anomalies' && !evidence.data.assessment) {
    const pages = chargeReviewMessages(anomalyTransactionCards(evidence.data, 0, 1, { accountId: typeof evidence.args.accountId === 'string' ? evidence.args.accountId : undefined }));
    return pages[pages.length - 1].inlineCards.flatMap((card) => card.kind === 'transaction' && card.payload.accountId && card.payload.transactionId && card.payload.amount !== null ? [{ id: card.payload.transactionId, accountId: card.payload.accountId, description: card.payload.description, amount: card.payload.amount }] : []);
  }
  const rows = assessment.transaction ? [assessment.transaction] :
    Array.isArray(evidence.data.items) ? evidence.data.items :
    Array.isArray(evidence.data.findings) ? evidence.data.findings : [evidence.data];
  return rows.flatMap((value) => {
    const row = record(value);
    const id = row._id ?? row.id;
    const accountId = row.accountId ?? row.account_id ?? evidence.args.accountId;
    if (typeof id !== 'string' || typeof accountId !== 'string' || typeof row.description !== 'string' || typeof row.amount !== 'number') return [];
    return [{ id, accountId, description: row.description, amount: row.amount }];
  });
}

export function resolveTransactionReference(message: string, session: Session): TransactionReference | null {
  const evidence = transactionEvidence(session);
  const latest = evidence[0];
  if (!latest) return null;
  const newestTool = [...session.contents].reverse().flatMap((content) => content.parts.map((part) => record(part.functionResponse))).find((response) => response.name && response.name !== 'present_card');
  if (newestTool && newestTool.name !== latest.name) {
    let turnStart = -1;
    session.contents.forEach((content, index) => { if (content.role === 'user' && content.parts.some((part) => typeof part.text === 'string')) turnStart = index; });
    if (newestTool.name !== 'insight_recurring_charges' || latest.name !== 'insight_anomalies' || latest.index < turnStart) return null;
  }
  const rows = references(latest).filter((row) => session.accounts.some((account) => account.id === row.accountId));
  if (latest.name !== 'insight_anomalies') rows.splice(8); // Match the rendered transaction-list rows.
  const text = message.toLowerCase();
  const ordinal = /\b(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th)\b/.exec(text)?.[1];
  if (ordinal) {
    const index = ordinal === 'last' ? rows.length - 1 : ({ first: 0, second: 1, third: 2, fourth: 3, fifth: 4, '1st': 0, '2nd': 1, '3rd': 2, '4th': 3, '5th': 4 } as Record<string, number>)[ordinal];
    return rows[index] ?? null;
  }
  const named = rows.filter((row) => text.includes(row.description.toLowerCase()));
  if (named.length === 1) return named[0];
  if (named.length > 1) {
    const amount = /\$\s*([\d,]+(?:\.\d{1,2})?)/.exec(text)?.[1];
    const matches = amount ? named.filter((row) => row.amount === Number(amount.replaceAll(',', ''))) : [];
    return matches.length === 1 ? matches[0] : null;
  }
  if (rows.length === 1 && /\b(?:it|that|this|charge|transaction|purchase)\b/.test(text)) return rows[0];
  return null;
}
