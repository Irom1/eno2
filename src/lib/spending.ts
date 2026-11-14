import { z } from 'zod';
import { products, type CreditProduct } from './products';

export const spendingCategorySchema = z.enum(['dining', 'groceries', 'entertainment', 'travel', 'shopping', 'gas', 'bills', 'other']);
export type SpendingCategory = z.infer<typeof spendingCategorySchema>;
export const spendingPreferencesSchema = z.object({ status: z.enum(['undecided', 'personalize', 'skip']), categories: z.array(spendingCategorySchema).max(8) });
export type SpendingPreferences = z.infer<typeof spendingPreferencesSchema>;
export const emptySpending = (): SpendingPreferences => ({ status: 'undecided', categories: [] });
export const spendingComplete = (value: SpendingPreferences) => value.status === 'skip' || (value.status === 'personalize' && value.categories.length > 0);
export const categoryLabels: Record<SpendingCategory, string> = { dining: 'Dining', groceries: 'Groceries', entertainment: 'Entertainment & streaming', travel: 'Travel', shopping: 'Shopping', gas: 'Gas & transit', bills: 'Everyday bills', other: 'A bit of everything' };
export interface DemoCard { id: CreditProduct; name: string; nickname: string; reason: string; url: string }
export function brandedCardName(card?: Pick<DemoCard, 'id' | 'name'> | null): string {
  return card?.id === 'discover' ? card.name : `Capital One ${card?.name ?? products.quicksilver.name}`;
}

/** Product themes only; generated activity and rewards use demo rules. */
export function recommendDemoCard(preferences: SpendingPreferences): DemoCard | null {
  if (preferences.status === 'undecided') return null;
  const primary = preferences.categories[0] ?? 'other';
  if (primary === 'travel') return demoCard('venture', 'Travel is your top priority, so Venture Rewards is your travel match.');
  if (['dining', 'groceries', 'entertainment'].includes(primary)) {
    return demoCard('savor', `${categoryLabels[primary]} comes first for you, so Savor is your food-and-fun match.`);
  }
  if (preferences.status === 'personalize' && preferences.categories[0] === 'other') {
    return demoCard('discover', 'For a mix of spending, Discover it Cash Back offers rotating cash back categories.');
  }
  return demoCard('quicksilver', 'Quicksilver is your all-around match for everyday spending.');
}

function demoCard(id: CreditProduct, reason: string): DemoCard {
  const { name, url } = products[id];
  return { id, name, url, nickname: `${name} · Eno demo`, reason };
}

export const demoCardNicknames = [
  'Venture · Eno demo',
  ...(['savor', 'quicksilver', 'venture', 'discover'] as const).map((id) => demoCard(id, '').nickname)
];
