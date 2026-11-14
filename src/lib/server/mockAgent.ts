/**
 * Deterministic offline agent (`LLM=mock`). It uses the real MCP tools, routes
 * by keyword, and composes answers from tool payloads only. No LLM calls.
 */
import type { ToolCallResult } from "./mcp";
import type { AgentEvent, Emit } from "./events";
import { trimContents, type Session } from "./session";
import { summarizeToolResult, toolLabel } from "./toolBridge";

export interface MockAgentDeps {
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolCallResult>;
  now: () => Date;
}

export interface MockAgentInput {
  session: Session;
  message: string;
  emit: Emit;
  /** Tool access is always injected: the in-process MCP session owns the client. */
  deps: MockAgentDeps;
}

type AnyRecord = Record<string, unknown>;

const rec = (value: unknown): AnyRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};
const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function money(value: unknown): string {
  const amount = Math.round(num(value) * 100) / 100;
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2
  })}`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function monthLabel(key: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  return `${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}

function checkingAccountId(session: Session): string {
  const checking = session.accounts.find((account) => account.type.toLowerCase() === "checking");
  return (checking ?? session.accounts[0])?.id ?? "";
}

function extractLocation(message: string, fallback: string): string {
  const match = /\bnear\s+(.+)$/i.exec(message);
  if (!match?.[1]) return fallback;
  const cleaned = match[1].replace(/[?.!,;:]+$/g, "").trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

export function routeIntent(message: string): {
  tool: string;
  args: (session: Session) => Record<string, unknown>;
} {
  const text = message.toLowerCase();

  if (/\bbill|due|paycheck|cover|rent\b/.test(text)) {
    return {
      tool: "insight_upcoming_bills",
      args: (session) => ({ customerId: session.customer.id, days: 30 })
    };
  }
  if (/\brecurring\b|\bsubscription/.test(text)) {
    return {
      tool: "insight_recurring_charges",
      args: (session) => ({ accountId: checkingAccountId(session) })
    };
  }
  if (/\bloans?\b|\bmortgage\b|\bdebt\b/.test(text)) {
    return {
      tool: "nessie_list_account_loans",
      args: (session) => ({ accountId: checkingAccountId(session) })
    };
  }
  if (/\bweird|anomal|duplicate|charge/.test(text)) {
    return {
      tool: "insight_anomalies",
      args: (session) => ({ accountId: checkingAccountId(session) })
    };
  }
  if (/\btransaction|\bactivity\b|\bpurchases?\b|\bdeposits?\b|\bwithdrawals?\b|\bhistory\b/.test(text)) {
    return {
      tool: "nessie_list_account_withdrawals",
      args: (session) => ({ accountId: checkingAccountId(session) })
    };
  }
  if (/\brewards?\b|\bpoints\b|\bcash ?back\b|\bmiles\b/.test(text)) {
    return {
      tool: "nessie_list_customer_accounts",
      args: (session) => ({ customerId: session.customer.id })
    };
  }
  if (/\bspend|where|money|categor/.test(text)) {
    return {
      tool: "insight_spending_breakdown",
      args: (session) => ({ accountId: checkingAccountId(session), months: 3 })
    };
  }
  if (/\batm|near\b/.test(text)) {
    return {
      tool: "find_nearby_atms",
      args: () => ({ location: extractLocation(message, "Arlington") })
    };
  }
  if (/\bbranch/.test(text)) {
    return {
      tool: "find_nearby_branches",
      args: () => ({ location: extractLocation(message, "22207") })
    };
  }
  return {
    tool: "insight_financial_overview",
    args: (session) => ({ customerId: session.customer.id })
  };
}

function billsAnswer(data: unknown): string {
  const payload = rec(data);
  const bills = Array.isArray(payload.bills) ? payload.bills.map(rec) : [];
  if (bills.length === 0 || num(payload.count) === 0) {
    return "I don't see any bills due in the next 30 days for this customer.";
  }
  const largest = [...bills].sort((a, b) => num(b.amount) - num(a.amount))[0] ?? {};
  const shortfall = num(payload.shortfall);
  const coverage =
    shortfall > 0
      ? `Checking holds ${money(payload.checkingBalance)}, so you're about ${money(shortfall)} short of covering them from checking.`
      : `Checking holds ${money(payload.checkingBalance)}, which covers them.`;
  return `You have ${num(payload.count)} bills due in the next 30 days, totaling ${money(
    payload.total
  )}. ${coverage} The largest is ${String(largest.payee ?? "a bill")} at ${money(
    largest.amount
  )}, due ${String(largest.dueDate ?? "soon")}. Liquid balances including savings are ${money(
    payload.liquidBalance
  )}, but coverage is measured against checking.`;
}

function spendingAnswer(data: unknown, now: Date): string {
  const payload = rec(data);
  const buckets = (Array.isArray(payload.monthlyTotals) ? payload.monthlyTotals : [])
    .map(rec)
    .filter((bucket): bucket is AnyRecord & { month: string } => typeof bucket.month === "string");
  const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const complete = buckets.filter((bucket) => bucket.month < currentKey);
  const latest = complete[complete.length - 1] ?? buckets[buckets.length - 1];

  if (!latest) {
    return "I couldn't find any spending in the last three months for this account.";
  }

  const breakdowns = (Array.isArray(payload.monthlyBreakdown) ? payload.monthlyBreakdown : []).map(rec);
  const monthBreakdown = breakdowns.find((entry) => String(entry.month) === latest.month);
  const categorySource = Array.isArray(monthBreakdown?.categories)
    ? monthBreakdown.categories
    : payload.categories;
  const categories = (Array.isArray(categorySource) ? categorySource : [])
    .map(rec)
    .sort((a, b) => num(b.total) - num(a.total));
  const top = categories[0];
  const monthTotal = monthBreakdown ? num(monthBreakdown.total) : num(latest.total);
  const categoryLine = top
    ? `The largest category was ${String(top.category)} at ${money(top.total)} (${Math.round(
        num(top.share) * 100
      )}% of ${monthBreakdown ? "that month" : "spending"}).`
    : "";
  const countLine = monthBreakdown
    ? `That month had ${num(monthBreakdown.transactionCount)} transactions.`
    : `Across the full three-month window you made ${num(
        payload.transactionCount
      )} transactions totaling ${money(payload.totalSpend)}.`;

  return `In ${monthLabel(latest.month)} you spent ${money(monthTotal)}. ${categoryLine} ${countLine}`;
}

function anomaliesAnswer(data: unknown): string {
  const payload = rec(data);
  const findings = Array.isArray(payload.findings) ? payload.findings.map(rec) : [];
  if (findings.length === 0) {
    return "Nothing unusual found on this account.";
  }
  const duplicate = findings.find(
    (finding) =>
      finding.type === "duplicate" && String(finding.description ?? "").toUpperCase().includes("NETFLIX")
  );
  const parts: string[] = [`I found ${num(payload.count)} alerts worth a look.`];
  if (duplicate) {
    parts.push(
      `There's a possible duplicate ${String(duplicate.description)} charge for ${money(
        duplicate.amount
      )} on ${String(duplicate.date)}, earlier on ${String(duplicate.duplicateOf)}.`
    );
  }
  const largePurchases = findings.filter((finding) => finding.type === "outlier");
  if (largePurchases.length > 0) {
    const first = largePurchases[0] ?? {};
    parts.push(
      `There's an unusually large purchase: ${String(first.description ?? "a charge")} for ${money(
        first.amount
      )} on ${String(first.date ?? "an unknown date")}.`
    );
  }
  return parts.join(" ");
}

function overviewAnswer(data: unknown): string {
  const payload = rec(data);
  const accounts = Array.isArray(payload.accounts) ? payload.accounts.map(rec) : [];
  const checking = accounts
    .filter((account) => String(account.type ?? "").toLowerCase() === "checking")
    .reduce((sum, account) => sum + num(account.balance), 0);
  const savings = accounts
    .filter((account) => String(account.type ?? "").toLowerCase() === "savings")
    .reduce((sum, account) => sum + num(account.balance), 0);
  const upcoming = rec(payload.upcomingBills);
  return `Across ${accounts.length} accounts you have ${money(
    payload.liquidTotal
  )} liquid: ${money(checking)} in checking and ${money(savings)} in savings. ${num(
    upcoming.count
  )} bills totaling ${money(upcoming.total)} are due in the next 30 days. Card balances total ${money(
    payload.cardBalances
  )} with ${num(payload.totalRewards).toLocaleString("en-US")} rewards.`;
}

function atmAnswer(data: unknown, location: string): string {
  const payload = rec(data);
  const results = Array.isArray(payload.results) ? payload.results.map(rec) : [];
  if (num(payload.count) === 0) {
    return `I couldn't find any ATMs matching "${location}".`;
  }
  const names = results
    .slice(0, 3)
    .map((row) => String(row.name ?? "ATM"))
    .join(", ");
  return `I found ${num(
    payload.count
  )} ATMs matching "${location}"${names ? `, including ${names}` : ""}. ATM records have no street address, so matching is by name only — try a nearby city or institution name if you need a specific location.`;
}

function branchAnswer(data: unknown, location: string): string {
  const payload = rec(data);
  const results = Array.isArray(payload.results) ? payload.results.map(rec) : [];
  if (num(payload.count) === 0) {
    return `I couldn't find any branches matching "${location}".`;
  }
  const first = results[0] ?? {};
  const address = rec(first.address);
  const place = [address.city, address.state].filter(Boolean).join(", ");
  return `I found ${num(payload.count)} branches matching "${location}".${
    place ? ` The first is in ${place}` : ""
  }. Branch data covers the DC metro area, so it may not reflect your own location.`;
}

function loansAnswer(data: unknown): string {
  const payload = rec(data);
  const loans = Array.isArray(payload.items) ? payload.items.map(rec) : [];
  if (loans.length === 0) {
    return "I don't see any active loans on this account.";
  }
  const total = loans.reduce((sum, loan) => sum + num(loan.amount), 0);
  const monthly = loans.reduce((sum, loan) => sum + num(loan.monthlyPayment), 0);
  const names = loans
    .map((loan) => String(loan.type ?? loan.description ?? "Loan"))
    .join(", ");
  return `You have ${loans.length} loans: ${names}. Their balances total ${money(
    total
  )}, with ${money(monthly)} due monthly.`;
}

function transactionsAnswer(data: unknown): string {
  const payload = rec(data);
  const rows = Array.isArray(payload.items) ? payload.items.map(rec) : [];
  if (rows.length === 0) {
    return "I couldn't find any recent transactions on this account.";
  }
  const total = rows.reduce((sum, row) => sum + num(row.amount), 0);
  return `Here are the ${rows.length} most recent transactions, totaling ${money(
    total
  )}. The latest is ${String(rows[0]?.description ?? "a transaction")}.`;
}

function accountsAnswer(data: unknown): string {
  const payload = rec(data);
  const accounts = Array.isArray(payload.items) ? payload.items.map(rec) : [];
  if (accounts.length === 0) {
    return "I couldn't find any accounts for this customer.";
  }
  const names = accounts
    .map((account) => String(account.nickname ?? account.type ?? "Account"))
    .join(", ");
  const credit = accounts.find((account) =>
    String(account.type ?? "").toLowerCase().includes("credit")
  );
  const rewardsLine = credit
    ? ` Your ${String(credit.nickname ?? "credit")} card is where credit-card rewards accrue.`
    : "";
  return `You have ${accounts.length} accounts: ${names}.${rewardsLine}`;
}

function composeAnswer(name: string, data: unknown, now: Date, message: string): string {
  switch (name) {
    case "insight_upcoming_bills":
      return billsAnswer(data);
    case "insight_spending_breakdown":
      return spendingAnswer(data, now);
    case "insight_anomalies":
      return anomaliesAnswer(data);
    case "nessie_list_account_loans":
      return loansAnswer(data);
    case "nessie_list_account_deposits":
    case "nessie_list_account_withdrawals":
      return transactionsAnswer(data);
    case "nessie_list_customer_accounts":
      return accountsAnswer(data);
    case "find_nearby_atms":
      return atmAnswer(data, extractLocation(message, "Arlington"));
    case "find_nearby_branches":
      return branchAnswer(data, extractLocation(message, "22207"));
    case "insight_financial_overview":
    default:
      return overviewAnswer(data);
  }
}

export async function mockAgent({ session, message, emit, deps }: MockAgentInput): Promise<void> {
  const { callTool, now } = deps;
  const intent = routeIntent(message);
  const args = intent.args(session);

  emit({ type: "tool_start", name: intent.tool, label: toolLabel(intent.tool) });
  const startedAt = Date.now();

  let text: string;
  try {
    const result = await callTool(intent.tool, args);
    const ms = Date.now() - startedAt;
    emit({
      type: "tool_result",
      name: intent.tool,
      ok: result.ok,
      ms,
      summary: summarizeToolResult(intent.tool, result.data)
    });
    if (!result.ok) {
      text = "I couldn't read that data right now. Please try again in a moment.";
    } else {
      emit({ type: "insight", kind: intent.tool, payload: result.data });
      text = composeAnswer(intent.tool, result.data, now(), message);
    }
  } catch {
    const ms = Date.now() - startedAt;
    emit({
      type: "tool_result",
      name: intent.tool,
      ok: false,
      ms,
      summary: "Could not load data"
    });
    text = "I couldn't read that data right now. Please try again in a moment.";
  }

  emit({ type: "text", delta: text });

  session.contents = trimContents([
    ...session.contents,
    { role: "user", parts: [{ text: message }] },
    { role: "model", parts: [{ text }] }
  ]);
  session.updatedAt = Date.now();

  emit({ type: "usage", promptTokens: 0, outputTokens: 0, rounds: 1 });
  emit({ type: "done", sessionId: session.id });
}

export type MockAgentEvent = AgentEvent;
