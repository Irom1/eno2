import { z } from 'zod';
import { accountProduct, products } from './products';
import { brandedCardName, demoCard } from './spending';

export const accountProductSchema = z.enum(['checking', 'savings', 'savor', 'quicksilver', 'venture', 'discover']);
export type AccountProductId = z.infer<typeof accountProductSchema>;
export const openAccountsSchema = z.object({
  customerId: z.string().min(1),
  products: z.array(accountProductSchema).min(1, 'Choose at least one account.').max(6)
    .refine((ids) => new Set(ids).size === ids.length, 'Choose each account only once.')
});

const descriptions: Record<AccountProductId, string> = {
  checking: 'For everyday spending', savings: 'For your next savings goal',
  savor: 'For food, groceries, and entertainment', quicksilver: 'For everyday spending across categories',
  venture: 'For your next adventure', discover: 'For a mix of spending and rotating categories'
};

export const openingProducts = accountProductSchema.options.map((id) => ({
  id,
  type: id === 'checking' ? 'Checking' as const : id === 'savings' ? 'Savings' as const : 'Credit Card' as const,
  description: descriptions[id], ...products[id],
  label: id === 'checking' || id === 'savings' ? products[id].name : brandedCardName(demoCard(id, ''))
}));
export type OpeningProduct = typeof openingProducts[number];

/** Match legacy nicknames too: one deposit account per type, one card per product. */
export function availableProducts(accounts: readonly { type: string; nickname: string }[]): OpeningProduct[] {
  const owned = new Set(accounts.map((account) => accountProduct(account.type, account.nickname)));
  return openingProducts.filter((option) => !owned.has(products[option.id]));
}
