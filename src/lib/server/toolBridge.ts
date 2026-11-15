/**
 * Bridges MCP tool metadata to Gemini function declarations and produces
 * compact, human-readable summaries for the UI's tool-call chips.
 */
import type { GeminiFunctionDeclaration } from "./gemini";
import type { McpTool } from "./mcp";

export interface ToolLike {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

type AnyRecord = Record<string, unknown>;

const ALLOWED_SCHEMA_KEYS = new Set([
  "type",
  "description",
  "properties",
  "required",
  "items",
  "enum",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "anyOf"
]);

const isRecord = (value: unknown): value is AnyRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Recursively strip schema keywords Gemini rejects, keeping the useful subset. */
export function sanitizeSchema(schema: unknown): AnyRecord {
  if (!isRecord(schema)) return { type: "object", properties: {} };

  const result: AnyRecord = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!ALLOWED_SCHEMA_KEYS.has(key)) continue;
    if (value === undefined || value === null) continue;

    switch (key) {
      case "properties": {
        if (!isRecord(value)) break;
        const properties: AnyRecord = {};
        for (const [propName, propSchema] of Object.entries(value)) {
          properties[propName] = sanitizeSchema(propSchema);
        }
        result.properties = properties;
        break;
      }
      case "items": {
        result.items = sanitizeSchema(value);
        break;
      }
      case "anyOf": {
        result.anyOf = Array.isArray(value) ? value.map((entry) => sanitizeSchema(entry)) : [];
        break;
      }
      case "required": {
        result.required = Array.isArray(value)
          ? value.filter((entry): entry is string => typeof entry === "string")
          : [];
        break;
      }
      case "enum": {
        result.enum = Array.isArray(value) ? value : [];
        break;
      }
      case "type":
      case "description":
      case "pattern": {
        if (typeof value === "string") result[key] = value;
        break;
      }
      case "minimum":
      case "maximum":
      case "minLength":
      case "maxLength": {
        if (typeof value === "number") result[key] = value;
        break;
      }
      default:
        break;
    }
  }

  if (!result.type && result.properties) result.type = "object";
  return result;
}

/** Convert MCP tools into Gemini function declarations (sanitized JSON Schema). */
export function toFunctionDeclarations(
  tools: readonly (ToolLike | McpTool)[],
): GeminiFunctionDeclaration[] {
  return tools.map((tool) => {
    const sanitized = sanitizeSchema(tool.inputSchema);
    if (sanitized.type !== "object") sanitized.type = "object";
    if (!sanitized.properties) sanitized.properties = {};

    return {
      name: tool.name,
      description: tool.description ?? tool.name,
      parametersJsonSchema: sanitized
    };
  });
}

export const TOOL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  nessie_list_customers: "Listing customers",
  nessie_get_customer: "Reading customer profile",
  nessie_list_customer_accounts: "Reading your accounts",
  nessie_list_customer_bills: "Reading your bills",
  nessie_get_account: "Reading your account",
  nessie_get_account_customer: "Checking account owner",
  nessie_list_account_bills: "Reading account bills",
  nessie_list_account_deposits: "Reading deposits",
  nessie_list_account_withdrawals: "Reading transactions",
  nessie_list_account_loans: "Reading loans",
  nessie_get_bill: "Reading a bill",
  nessie_get_deposit: "Reading a deposit",
  nessie_get_loan: "Reading a loan",
  nessie_get_purchase: "Reading a purchase",
  nessie_get_transfer: "Reading a transfer",
  nessie_get_withdrawal: "Reading a withdrawal",
  nessie_list_merchants: "Reading merchants",
  nessie_get_merchant: "Reading a merchant",
  nessie_list_atms: "Listing ATMs",
  nessie_get_atm: "Reading an ATM",
  nessie_list_branches: "Listing branches",
  nessie_get_branch: "Reading a branch",
  insight_financial_overview: "Gathering your overview",
  insight_spending_breakdown: "Reviewing spending",
  insight_top_transactions: "Comparing your purchases",
  insight_top_merchants: "Reviewing where you shop",
  insight_upcoming_bills: "Checking upcoming bills",
  insight_recurring_charges: "Finding subscriptions",
  insight_anomalies: "Looking for odd charges",
  insight_goal_projection: "Projecting a savings goal",
  insight_climatewise: "Checking your LORAXⓇ Score",
  find_nearby_atms: "Finding nearby ATMs",
  find_nearby_branches: "Finding nearby branches"
});

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

const rec = (value: unknown): AnyRecord => (isRecord(value) ? value : {});
const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function formatMoney(value: unknown): string {
  const amount = Math.round(num(value) * 100) / 100;
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2
  });
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

function formatMonth(key: unknown): string {
  if (typeof key !== "string") return "";
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key;
  const year = match[1];
  const monthIndex = Number(match[2]) - 1;
  return `${MONTHS[monthIndex] ?? monthIndex + 1} ${year}`;
}

function latestCompleteMonth(data: AnyRecord, now = new Date()): { month: string; total: number } | null {
  const mom = rec(data.monthOverMonth);
  if (typeof mom.to === "string") {
    const buckets = Array.isArray(data.monthlyTotals) ? data.monthlyTotals : [];
    const match = buckets.map(rec).find((bucket) => bucket.month === mom.to);
    if (match) return { month: mom.to, total: num(match.total) };
    return { month: mom.to, total: 0 };
  }

  const buckets = (Array.isArray(data.monthlyTotals) ? data.monthlyTotals : [])
    .map(rec)
    .filter((bucket): bucket is AnyRecord & { month: string } => typeof bucket.month === "string");
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const complete = buckets.filter((bucket) => bucket.month < currentKey);
  const chosen = complete[complete.length - 1] ?? buckets[buckets.length - 1];
  return chosen ? { month: chosen.month, total: num(chosen.total) } : null;
}

/** One-line summary for a completed tool call. Defensive about empty payloads. */
export function summarizeToolResult(name: string, data: unknown): string {
  const payload = rec(data);

  switch (name) {
    case "insight_upcoming_bills": {
      const count = num(payload.count);
      const total = num(payload.total);
      const shortfall = num(payload.shortfall);
      if (count === 0) return "No bills due in the next 30 days";
      const coverage =
        shortfall > 0
          ? `$${formatMoney(shortfall)} short vs checking`
          : "covered by checking";
      return `${count} bills · $${formatMoney(total)} due · ${coverage}`;
    }
    case "insight_spending_breakdown": {
      const latest = latestCompleteMonth(payload);
      const breakdowns = Array.isArray(payload.monthlyBreakdown)
        ? payload.monthlyBreakdown.map(rec)
        : [];
      const monthBreakdown = latest
        ? breakdowns.find((entry) => entry.month === latest.month)
        : undefined;
      const count = monthBreakdown
        ? num(monthBreakdown.transactionCount)
        : num(payload.transactionCount);
      if (!latest) return `${count} transactions`;
      return `${formatMonth(latest.month)} $${formatMoney(latest.total)} · ${count} transactions`;
    }
    case "insight_financial_overview": {
      const accountCount = Array.isArray(payload.accounts) ? payload.accounts.length : 0;
      return `${accountCount} accounts · liquid $${formatMoney(payload.liquidTotal)}`;
    }
    case "insight_anomalies": {
      const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
      if (summary) return summary;
      const count = num(payload.count);
      if (count === 0) return "No anomalies found";
      const findings = Array.isArray(payload.findings) ? payload.findings.map(rec) : [];
      const duplicate = findings.find((finding) => finding.type === "duplicate");
      if (duplicate) {
        const description = String(duplicate.description ?? "");
        return `${count} findings · includes duplicate ${description} $${formatMoney(duplicate.amount)}`;
      }
      return `${count} findings`;
    }
    case "insight_recurring_charges": {
      const count = num(payload.count);
      return `${count} recurring charges`;
    }
    case "insight_top_transactions": {
      return `${num(payload.count)} matching transactions`;
    }
    case "insight_top_merchants": {
      return `${num(payload.count)} merchants`;
    }
    case "insight_goal_projection": {
      const months = payload.monthsToTarget;
      return typeof months === "number" ? `${months} months to target` : "Goal projection ready";
    }
    case "insight_climatewise": {
      const score =
        typeof payload.score === "number" && Number.isFinite(payload.score)
          ? payload.score
          : null;
      const tier = typeof payload.tier === "string" ? payload.tier.trim() : "";
      const totalKg =
        typeof payload.totalKg === "number" && Number.isFinite(payload.totalKg)
          ? payload.totalKg
          : null;
      if (score === null && totalKg === null) return "Your emissions report is ready";
      const scoreText = score === null ? "" : tier ? `${score} ${tier}` : `${score}`;
      return [scoreText, totalKg === null ? "" : `${totalKg} kg`].filter(Boolean).join(" · ");
    }
    case "find_nearby_atms": {
      return `${num(payload.count)} ATMs`;
    }
    case "find_nearby_branches": {
      return `${num(payload.count)} branches`;
    }
    default:
      break;
  }

  if (typeof payload.count === "number") return `${payload.count} rows`;
  if (Array.isArray(data)) return `${data.length} rows`;
  return "Done";
}
