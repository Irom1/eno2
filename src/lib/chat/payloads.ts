/**
 * Client-safe helpers for the common shapes of tool payloads.
 * Pure functions only: no server imports, safe to bundle in the browser.
 */

/** True for non-null, non-array objects. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const LIST_KEYS = ['items', 'results', 'bills', 'accounts'] as const;

/**
 * Pull row objects out of the common tool payload shapes. Handles arrays,
 * `{items}`, `{results}`, `{bills}`, `{accounts}`, and a single record.
 * Wrapper-only payloads (count/message with no list) resolve to an empty list.
 */
export function asItems(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];

  for (const key of LIST_KEYS) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }

  if ('count' in payload || 'truncated' in payload || 'message' in payload) return [];
  return [payload];
}

/** Coerce any payload into an object without throwing. */
export function asRecord(payload: unknown): Record<string, unknown> {
  return isRecord(payload) ? payload : {};
}
