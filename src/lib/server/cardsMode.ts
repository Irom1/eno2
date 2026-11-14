/**
 * Pure card-pipeline flag helper. Kept separate from `env.ts` so tests and
 * modules that only need the flag never load `$env/dynamic/private`.
 */
export type CardsMode = 'off' | 'v2';

/** Resolve the card pipeline mode. Unset means v2. */
export function cardsMode(
  runtime: Pick<{ CARDS_MODE?: CardsMode }, 'CARDS_MODE'> | null | undefined
): CardsMode {
  return runtime?.CARDS_MODE === 'off' ? 'off' : 'v2';
}
