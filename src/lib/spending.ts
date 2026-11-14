import { z } from 'zod';

export const spendingCategorySchema = z.enum(['dining', 'groceries', 'entertainment', 'travel', 'shopping', 'gas', 'bills', 'other']);
export type SpendingCategory = z.infer<typeof spendingCategorySchema>;
export const spendingPreferencesSchema = z.object({ status: z.enum(['undecided', 'personalize', 'skip']), categories: z.array(spendingCategorySchema).max(8) });
export type SpendingPreferences = z.infer<typeof spendingPreferencesSchema>;
export const emptySpending = (): SpendingPreferences => ({ status: 'undecided', categories: [] });
export const spendingComplete = (value: SpendingPreferences) => value.status === 'skip' || (value.status === 'personalize' && value.categories.length > 0);
export const categoryLabels: Record<SpendingCategory, string> = { dining: 'Dining', groceries: 'Groceries', entertainment: 'Entertainment & streaming', travel: 'Travel', shopping: 'Shopping', gas: 'Gas & transit', bills: 'Everyday bills', other: 'A bit of everything' };
export interface DemoCard { id: 'savor' | 'venture' | 'quicksilver'; name: string; nickname: string; reason: string }
/** Product themes only; generated activity and rewards use demo rules. */
export function recommendDemoCard(preferences: SpendingPreferences): DemoCard | null {
  if (preferences.status !== 'personalize' || !preferences.categories.length) return null;
  const primary = preferences.categories[0];
  if (primary === 'travel') return { id: 'venture', name: 'Venture', nickname: 'Venture · Eno demo', reason: 'Travel is your top priority, so this demo has a travel theme.' };
  if (['dining', 'groceries', 'entertainment'].includes(primary)) return { id: 'savor', name: 'Savor', nickname: 'Savor · Eno demo', reason: `${categoryLabels[primary]} comes first for you, so this demo has a food-and-fun theme.` };
  return { id: 'quicksilver', name: 'Quicksilver', nickname: 'Quicksilver · Eno demo', reason: 'Your everyday spending gets a simple, all-around demo card.' };
}
export const demoCardNicknames = ['Savor · Eno demo', 'Venture · Eno demo', 'Quicksilver · Eno demo'];
