import type { Intent } from './intents.js';
import { isConversationFollowUp } from './requestScope.js';

/** True only for prompts that ask for a recent/all transaction list. */
export function shouldInferTransactionList(prompt: string, intents: Set<Intent>): boolean {
  const text = String(prompt ?? '').toLowerCase();
  if (isConversationFollowUp(text) || intents.has('anomalies')) return false;
  if (/\b(?:biggest|largest|top|highest|most expensive)\b/.test(text)) return false;
  if (intents.has('spending')) return false;
  if (intents.has('merchants')) return false;
  if (/\bat\s+\S/.test(text)) return false;
  return intents.has('transactions');
}
