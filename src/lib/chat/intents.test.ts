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

  it('classifies grocery expenses as spending', () => {
    expect(classifyIntents('What are my biggest grocery expenses').has('spending')).toBe(true);
  });

  it('classifies purchases as transactions', () => {
    expect(classifyIntents('Show me my purchases').has('transactions')).toBe(true);
  });

  it('classifies where-you-shop phrasing as merchants', () => {
    expect(classifyIntents('Where do I shop most?').has('merchants')).toBe(true);
    expect(classifyIntents('Who is my most frequent merchant?').has('merchants')).toBe(true);
    expect(classifyIntents('What is my favorite merchant?').has('merchants')).toBe(true);
  });

  it('classifies climate and emissions questions', () => {
    for (const prompt of [
      "What's my ClimateWise score?",
      'Tell me about my LORAX score',
      'How can I lower my emissions?',
      'What is my carbon footprint?',
      'How much CO2 do I produce?'
    ]) {
      expect(classifyIntents(prompt).has('climate'), prompt).toBe(true);
    }
  });

  it('returns an empty set for empty or malformed input', () => {
    expect(classifyIntents('').size).toBe(0);
    expect(classifyIntents('   ').size).toBe(0);
    expect(classifyIntents(undefined as unknown as string).size).toBe(0);
  });
});
