import { expect, it } from 'vitest';
import { isConversationFollowUp, requestsAnomalyList } from './requestScope';

it('distinguishes a list request from the screenshot follow-ups and quoted commands', () => {
  for (const prompt of ['Show me suspicious transactions', 'Any suspicious charges?', 'Anything weird across my accounts?', 'List duplicate purchases on checking', 'Could you show me suspicious transactions?']) expect(requestsAnomalyList(prompt), prompt).toBe(true);
  for (const prompt of ['is that first one suspicious', 'why didnt you include it when i asked for suspicious transactions', 'i asked why not show me', 'Is the $159 LOCAL COFFEE purchase suspicious?', 'What makes that charge unusual?']) {
    expect(isConversationFollowUp(prompt), prompt).toBe(true);
    expect(requestsAnomalyList(prompt), prompt).toBe(false);
  }
});
