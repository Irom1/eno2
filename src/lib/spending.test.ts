import { expect, it } from 'vitest';
import { recommendDemoCard, spendingComplete } from './spending';

it('matches demo card themes to the user’s first priority and permits skipping', () => {
  expect(recommendDemoCard({ status: 'personalize', categories: ['travel', 'dining'] })?.id).toBe('venture');
  expect(recommendDemoCard({ status: 'personalize', categories: ['groceries', 'travel'] })?.id).toBe('savor');
  expect(recommendDemoCard({ status: 'personalize', categories: ['gas', 'shopping'] })?.id).toBe('quicksilver');
  expect(recommendDemoCard({ status: 'skip', categories: ['travel'] })).toBeNull();
  expect(spendingComplete({ status: 'personalize', categories: [] })).toBe(false);
  expect(spendingComplete({ status: 'skip', categories: [] })).toBe(true);
});
