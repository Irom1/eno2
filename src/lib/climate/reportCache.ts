import type { ClimateReport } from './emissions';

interface Entry { accountIds: string[]; report: ClimateReport }
type SessionStorage = Pick<Storage, 'getItem' | 'setItem'>;
const signature = (ids: readonly string[]) => JSON.stringify([...new Set(ids)].sort());
const storageKey = (customerId: string, days: number) => `eno-climate-report-v1:${encodeURIComponent(customerId)}:${days}`;

function validEntry(value: unknown, days: number): value is Entry {
  const entry = value as Entry | null;
  const report = entry?.report;
  return !!entry && Array.isArray(entry.accountIds) && entry.accountIds.every((id) => typeof id === 'string') &&
    !!report && report.days === days && Number.isFinite(report.score) && typeof report.tier === 'string' &&
    Number.isFinite(report.totalKg) && Array.isArray(report.categories) && Array.isArray(report.topPurchases) &&
    Array.isArray(report.nudges) && Array.isArray(report.greenness?.ratings) && !!report.equivalents;
}

/** Browser-session reports survive component remounts and reloads, isolated by profile. */
export function createClimateReportCache(readStorage: () => SessionStorage | undefined = () => {
  try { return sessionStorage; } catch { return undefined; }
}) {
  const reports = new Map<string, Entry>();
  const pending = new Map<string, Promise<ClimateReport>>();
  const latest = new Map<string, symbol>();

  function peek(customerId: string, days = 90, accountIds?: readonly string[]): ClimateReport | null {
    if (!customerId) return null;
    const key = storageKey(customerId, days);
    let entry = reports.get(key);
    if (!entry) {
      try {
        const stored: unknown = JSON.parse(readStorage()?.getItem(key) ?? 'null');
        if (validEntry(stored, days)) { entry = stored; reports.set(key, stored); }
      } catch { /* A missing/corrupt cache is safe to recompute. */ }
    }
    return entry && (accountIds === undefined || signature(entry.accountIds) === signature(accountIds)) ? entry.report : null;
  }

  async function load(customerId: string, accountIds: readonly string[], days = 90): Promise<ClimateReport> {
    if (!customerId) throw new Error('Choose a profile before loading its report.');
    const cached = peek(customerId, days, accountIds);
    if (cached) return cached;
    const key = storageKey(customerId, days);
    const requestKey = `${key}:${signature(accountIds)}`;
    const existing = pending.get(requestKey);
    if (existing) return existing;
    const token = Symbol();
    latest.set(key, token);
    const result = (async () => {
      const response = await fetch(`/api/climate?days=${days}&customer=${encodeURIComponent(customerId)}`, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error('Could not load the report.');
      const data = await response.json();
      const entry: Entry = { accountIds: [...accountIds], report: data.report };
      if (data.customer?.id !== customerId || !validEntry(entry, days)) throw new Error('Could not confirm the report for this profile.');
      // A late response for an older account list must not replace a newer one.
      if (latest.get(key) === token) {
        reports.set(key, entry);
        try { readStorage()?.setItem(key, JSON.stringify(entry)); } catch { /* Keep the in-memory cache if storage is blocked/full. */ }
      }
      return entry.report;
    })();
    pending.set(requestKey, result);
    try { return await result; }
    finally { pending.delete(requestKey); }
  }

  return { peek, load };
}

export const climateReportCache = createClimateReportCache();
