import { describe, expect, it } from 'vitest';
import { classifyIntents } from './intents';

describe('classifyIntents', () => {
  it('classifies a specific loans question only', () => {
    const intents = classifyIntents('Show me my loans');
    expect([...intents]).toEqual(['loans']);
  });

  it('unions multiple intents', () => {
    const intents = classifyIntents('Show me my credit card rewards');
    expect(intents.has('credit')).toBe(true);
    expect(intents.has('rewards')).toBe(true);
  });

  it('returns an empty set for an unknown prompt', () => {
    expect(classifyIntents('Tell me something interesting').size).toBe(0);
  });

  it('returns an empty set for empty or malformed input', () => {
    expect(classifyIntents('').size).toBe(0);
    expect(classifyIntents('   ').size).toBe(0);
    expect(classifyIntents(undefined as unknown as string).size).toBe(0);
  });
});
