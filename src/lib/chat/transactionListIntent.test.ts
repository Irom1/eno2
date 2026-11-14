import { describe, expect, it } from 'vitest';
import { classifyIntents } from './intents';
import { shouldInferTransactionList } from './transactionListIntent';

function infer(prompt: string): boolean {
  return shouldInferTransactionList(prompt, classifyIntents(prompt));
}

describe('shouldInferTransactionList', () => {
  it('accepts recent/all transaction prompts', () => {
    expect(infer('Show me my recent transactions')).toBe(true);
    expect(infer('Show my withdrawals')).toBe(true);
    expect(infer('Show my activity')).toBe(true);
  });

  it('rejects ranked, category, and merchant-filtered prompts', () => {
    expect(infer('What are my biggest grocery expenses')).toBe(false);
    expect(infer('Show my grocery transactions')).toBe(false);
    expect(infer("Show my transactions at Trader Joe's")).toBe(false);
    expect(infer('Show me my largest transactions')).toBe(false);
    expect(infer('What are my biggest purchases?')).toBe(false);
  });
});
