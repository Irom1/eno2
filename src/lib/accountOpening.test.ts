import { expect, it } from 'vitest';
import { availableProducts, openAccountsSchema } from './accountOpening';

it('excludes legacy deposit accounts and owned card families while keeping other cards', () => {
  const accounts = [{ type: 'Checking', nickname: 'Everyday Checking' }, { type: 'Savings', nickname: 'Emergency Fund' }, { type: 'Credit Card', nickname: 'Venture · Eno demo' }];
  expect(availableProducts(accounts).map((option) => option.id)).toEqual(['savor', 'quicksilver', 'discover']);
  expect(availableProducts([{ type: 'Credit Card', nickname: 'Savor · Eno demo' }]).map((option) => option.id)).toEqual(['checking', 'savings', 'quicksilver', 'venture', 'discover']);
});
it('offers every unowned product and nothing when all are owned', () => {
  const options = availableProducts([]);
  expect(options).toHaveLength(6);
  expect(availableProducts(options.map((option) => ({ type: option.type, nickname: option.name })))).toEqual([]);
});
it('requires known products selected once each', () => {
  for (const products of [[], ['checking', 'checking'], ['made-up-card']]) expect(openAccountsSchema.safeParse({ customerId: 'ada', products }).success).toBe(false);
  expect(openAccountsSchema.safeParse({ customerId: 'ada', products: ['savor', 'venture'] }).success).toBe(true);
});
