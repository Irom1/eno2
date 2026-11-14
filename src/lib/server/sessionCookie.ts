import type { AccountSummary, CustomerIdentity } from "./session";

export const SESSION_COOKIE = "nessie_session";

export interface PublicSession {
  sessionId: string;
  customer: CustomerIdentity;
  accounts: AccountSummary[];
}

export function publicSession(session: {
  id: string;
  customer: CustomerIdentity;
  accounts: AccountSummary[];
}): PublicSession {
  return {
    sessionId: session.id,
    customer: session.customer,
    accounts: session.accounts
  };
}
