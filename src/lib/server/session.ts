/**
 * In-memory chat sessions. The browser holds only an opaque session id in an
 * httpOnly cookie; the transcript never leaves the server.
 */

import { isDeletedDemoCustomer } from './deletedDemoCustomers';

export interface CustomerIdentity {
  id: string;
  firstName: string;
  lastName: string;
}

export interface AccountSummary {
  id: string;
  type: string;
  nickname: string;
  balance: number;
  rewards: number;
  accountNumber: string;
}

/** Loose part shape so Gemini parts (incl. thoughtSignature) round-trip intact. */
export type ContentPart = Record<string, unknown>;

export interface Content {
  role: "user" | "model";
  parts: ContentPart[];
}

export interface Session {
  id: string;
  customer: CustomerIdentity;
  accounts: AccountSummary[];
  contents: Content[];
  createdAt: number;
  updatedAt: number;
}

// Demo sessions must survive an idle judge's deliberation. The client can also
// recover a lost session from the customer id, but a long TTL keeps the common
// case (nobody touched the demo for an hour) working without a round trip.
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_SESSIONS = 500;
export const MAX_CONTENT_ENTRIES = 40;

interface SessionGlobal {
  __nessieSessions?: Map<string, Session>;
}

const globalForSessions = globalThis as typeof globalThis & SessionGlobal;

function store(): Map<string, Session> {
  if (!globalForSessions.__nessieSessions) {
    globalForSessions.__nessieSessions = new Map<string, Session>();
  }
  return globalForSessions.__nessieSessions;
}

function isExpired(session: Session, now: number): boolean {
  return now - session.updatedAt > SESSION_TTL_MS;
}

function prune(now: number): void {
  const sessions = store();
  for (const [id, session] of sessions) {
    if (isExpired(session, now)) sessions.delete(id);
  }
}

export function createSession(
  customer: CustomerIdentity,
  accounts: AccountSummary[],
  now: number = Date.now()
): Session {
  prune(now);
  const sessions = store();

  if (sessions.size >= MAX_SESSIONS) {
    const oldest = [...sessions.values()].sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (oldest) sessions.delete(oldest.id);
  }

  const session: Session = {
    id: crypto.randomUUID(),
    customer,
    accounts,
    contents: [],
    createdAt: now,
    updatedAt: now
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string | undefined | null, now: number = Date.now()): Session | null {
  if (!id) return null;
  const sessions = store();
  const session = sessions.get(id);
  if (!session) return null;
  if (isExpired(session, now) || isDeletedDemoCustomer(session.customer.id)) {
    sessions.delete(id);
    return null;
  }
  session.updatedAt = now;
  return session;
}

export function destroySession(id: string | undefined | null): boolean {
  if (!id) return false;
  return store().delete(id);
}

export function destroyCustomerSessions(customerId: string): void {
  for (const [id, session] of store()) {
    if (session.customer.id === customerId) store().delete(id);
  }
}

const isFunctionResponsePart = (part: ContentPart): boolean =>
  Boolean(part.functionResponse) && !part.text && !part.functionCall;

const isToolResponseContent = (content: Content): boolean =>
  content.role === "user" &&
  content.parts.length > 0 &&
  content.parts.every((part) => isFunctionResponsePart(part));

/**
 * Keep the transcript bounded and never let it begin with a tool response:
 * Gemini rejects histories whose first turn is a function response.
 */
export function trimContents(contents: readonly Content[]): Content[] {
  const trimmed = contents.slice(-MAX_CONTENT_ENTRIES).map((content) => ({
    role: content.role,
    parts: [...content.parts]
  }));

  while (trimmed.length > 0 && isToolResponseContent(trimmed[0] as Content)) {
    trimmed.shift();
  }
  return trimmed;
}

export function clearSessions(): void {
  store().clear();
}
