/** Public shapes shared by the Svelte UI and the SSE client. No server-only imports. */

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface AccountSummary {
  id: string;
  type: string;
  nickname: string;
  balance: number;
  rewards: number;
  accountNumber: string;
}

export interface OverviewAccount {
  _id: string;
  type: string;
  nickname: string;
  balance: number;
  rewards: number;
  accountNumber: string;
}

export interface Health {
  ok: boolean;
  llm: string;
  gemini: { configured: boolean; model: string };
  nessie: {
    ok: boolean;
    customerCount: number;
    warning?: string;
    error?: string;
  };
  mcp: { ok: boolean; toolCount: number; error?: string };
  timestamp: string;
}

export interface MonthlyCashflow {
  month: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface OverviewPayload {
  asOf: string;
  accounts: OverviewAccount[];
  liquidTotal: number;
  cardBalances: number;
  totalRewards: number;
  cashflow90Days: { inflow: number; outflow: number; net: number };
  savingsRate: number;
  monthlyCashflow: MonthlyCashflow[];
  upcomingBills: { total: number; count: number };
  loanObligations: { monthlyPayment: number; count: number };
}

export interface Bill {
  billId: string;
  payee: string;
  nickname: string;
  amount: number;
  dueDate: string;
  daysUntil: number;
  status: string;
  accountId: string;
}

export interface BillsPayload {
  asOf: string;
  days: number;
  bills: Bill[];
  count: number;
  total: number;
  liquidBalance: number;
  checkingBalance: number;
  coverageBasis: string;
  coverageRatio: number | null;
  shortfall: number;
  covered: boolean;
}

export interface CategoryTotal {
  category: string;
  total: number;
  share: number;
}

export interface MonthlySpendingBreakdown {
  month: string;
  total: number;
  transactionCount: number;
  categories: CategoryTotal[];
}

export interface SpendingPayload {
  months: number;
  monthlyTotals: Array<{ month: string; total: number }>;
  monthlyBreakdown: MonthlySpendingBreakdown[];
  categories: CategoryTotal[];
  topDescriptions: Array<{ description: string; total: number; count: number }>;
  largestTransactions: Array<{ description: string; amount: number; date: string }>;
  monthOverMonth: {
    from: string;
    to: string;
    delta: number;
    pctChange: number;
  } | null;
  transactionCount: number;
  totalSpend: number;
  averageTransaction: number;
  estimated?: boolean;
  method?: string;
}

export interface AnomalyFinding {
  type: "duplicate" | "outlier" | string;
  description: string;
  amount: number;
  date: string;
  duplicateOf?: string;
  reason?: string;
}

export interface AnomaliesPayload {
  count: number;
  findings: AnomalyFinding[];
}

export interface Place {
  _id?: string;
  name: string;
  hours?: string;
  phone_number?: string;
  address?: { street?: string; city?: string; state?: string; zip?: string };
  lat?: number;
  lng?: number;
  note?: string;
}

export interface PlacesPayload {
  count: number;
  results?: Place[];
  message?: string;
}

export type PlaceKind = "atm" | "branch";

export type ToolStatus = "running" | "ok" | "error";

export interface ToolCallView {
  id: string;
  name: string;
  label: string;
  status: ToolStatus;
  ms?: number;
  summary?: string;
  payload?: unknown;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  error?: string;
  pending?: boolean;
  tools?: ToolCallView[];
  updatedKinds?: string[];
}

export interface InsightState {
  overview?: OverviewPayload;
  bills?: BillsPayload;
  spending?: SpendingPayload;
  anomalies?: AnomaliesPayload;
  places?: PlacesPayload;
  placesKind?: PlaceKind;
}

export type ProviderFailureReason = "credits" | "auth" | "rate_limit" | "unavailable";

export type SseEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; name: string; label: string }
  | { type: "tool_result"; name: string; ok: boolean; ms: number; summary: string }
  | { type: "insight"; kind: string; payload: unknown; accountId?: string }
  | { type: "usage"; promptTokens: number; outputTokens: number; rounds: number }
  | { type: "done"; sessionId: string }
  | { type: "notice"; provider: "gemini"; reason: ProviderFailureReason; message: string }
  | { type: "error"; message: string; hint?: string };
