/**
 * Server-only environment resolution for the Cloudflare Workers runtime.
 *
 * Values come from `platform.env` in production (Wrangler bindings / secrets)
 * and from `$env/dynamic/private` during local Vite dev. Never import this
 * module from client code.
 */
import { env as privateEnv } from '$env/dynamic/private';
import { cardsMode, type CardsMode } from './cardsMode';

export { cardsMode };

export interface RuntimeEnv {
  NESSIE_API_KEY: string;
  NESSIE_BASE_URL: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  LLM: 'gemini' | 'mock';
  /** Cards v2 pipeline: `off` keeps today's client-only inference. Defaults to `v2`. */
  CARDS_MODE?: CardsMode;
}

const DEFAULT_BASE_URL = 'https://prod-api.nessieisreal.com';
const DEFAULT_MODEL = 'gemini-3.8-flash';

type Source = Record<string, string | undefined>;

function read(sources: Source[], name: string): string {
  for (const source of sources) {
    const value = source[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function resolveEnv(platform?: App.Platform): RuntimeEnv {
  // Later sources win: platform bindings override dev-time private env.
  const sources: Source[] = [privateEnv as Source, (platform?.env ?? {}) as Source];

  const NESSIE_API_KEY = read(sources, 'NESSIE_API_KEY');
  const NESSIE_BASE_URL = read(sources, 'NESSIE_BASE_URL') || DEFAULT_BASE_URL;
  const GEMINI_API_KEY = read(sources, 'GEMINI_API_KEY');
  const GEMINI_MODEL = read(sources, 'GEMINI_MODEL') || DEFAULT_MODEL;

  const requested = read(sources, 'LLM').toLowerCase();
  const LLM: RuntimeEnv['LLM'] =
    requested === 'mock' ? 'mock' : requested === 'gemini' ? 'gemini' : GEMINI_API_KEY ? 'gemini' : 'mock';

  const CARDS_MODE: RuntimeEnv['CARDS_MODE'] =
    read(sources, 'CARDS_MODE').toLowerCase() === 'off' ? 'off' : 'v2';

  return {
    NESSIE_API_KEY,
    NESSIE_BASE_URL,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    LLM,
    CARDS_MODE
  };
}
