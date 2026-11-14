/**
 * Ownership guard: every tool call may only reference the selected customer
 * and that customer's account ids. Only `customerId` / `accountId` keys are
 * inspected; other arguments pass through untouched.
 */

export interface AccountRef {
  id?: string;
  _id?: string;
}

export interface Allowlist {
  customerId: string;
  accountIds: Set<string>;
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

export function buildAllowlist(
  customerId: string,
  accounts: ReadonlyArray<AccountRef>
): Allowlist {
  const accountIds = new Set<string>();
  for (const account of accounts) {
    const id = account.id ?? account._id;
    if (typeof id === "string" && id.length > 0) accountIds.add(id);
  }
  return { customerId, accountIds };
}

export function assertToolArgsAllowed(args: unknown, allowlist: Allowlist): GuardResult {
  const violation = findViolation(args, allowlist);
  if (violation) return { ok: false, reason: violation };
  return { ok: true };
}

function findViolation(value: unknown, allowlist: Allowlist): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const violation = findViolation(entry, allowlist);
      if (violation) return violation;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === "customerId" && typeof entry === "string" && entry.length > 0) {
      if (entry !== allowlist.customerId) {
        return "That customer is outside this session.";
      }
      continue;
    }
    if (key === "accountId" && typeof entry === "string" && entry.length > 0) {
      if (!allowlist.accountIds.has(entry)) {
        return "That account is outside this session.";
      }
      continue;
    }
    const violation = findViolation(entry, allowlist);
    if (violation) return violation;
  }

  return null;
}
