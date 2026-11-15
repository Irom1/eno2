/**
 * Deterministic offline agent (`LLM=mock`). It uses the real MCP tools, routes
 * by keyword, and composes answers from tool payloads only. No LLM calls.
 */
import type { ToolCallResult } from "./mcp";
import { GUEST_CUSTOMER_ID } from "../chat/guest";
import type { AgentEvent, Emit } from "./events";
import { trimContents, type Session } from "./session";
import { summarizeToolResult, toolLabel } from "./toolBridge";
import { summarizeAnomalyPatterns } from "./nessie/tools/insights";
import { extractLocation } from "./locationQuery";

export { extractLocation } from "./locationQuery";

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

/**
 * Relative due timing for prose. The bill card already shows the exact due
 * date, so deterministic answers describe timing analytically instead of
 * restating the date.
 */
function relativeDue(daysUntil: unknown): string {
  const days = typeof daysUntil === "number" ? daysUntil : Number(daysUntil);
  if (!Number.isFinite(days)) return "in the coming weeks";
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return "within the next week";
  if (days <= 14) return "within the next two weeks";
  if (days <= 21) return "within the next three weeks";
  return "in the coming weeks";
}

function money(value: unknown): string {
  const amount = Math.round(num(value) * 100) / 100;
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2
  })}`;
}

/**
 * Safe, concrete next steps per known intent, written as natural prose rather
 * than labeled tips. They never restate card data (amounts, balances, dates,
 * names, statuses, or rows).
 */
const INTENT_NEXT_STEPS: Record<string, string> = {
  insight_upcoming_bills:
    "If you want to cover the shortfall, you can move money to checking before the due dates.",
  insight_spending_breakdown:
    "You can open a category in Activity to see the transactions behind it.",
  insight_top_transactions: "Open any transaction to see its full details.",
  insight_anomalies:
    "If you don’t recognize a charge, you can review and dispute it in the app.",
  insight_recurring_charges:
    "You can review subscriptions you no longer use in the app.",
  insight_top_merchants: "You can review merchant activity in the app.",
  nessie_list_account_loans: "Open the loan details to see the payment schedule.",
  nessie_list_account_deposits: "Open any transaction to see its full details.",
  nessie_list_account_withdrawals: "Open any transaction to see its full details.",
  nessie_list_account_transactions: "Open any transaction to see its full details.",
  nessie_list_customer_accounts: "Switch accounts to compare balances.",
  nessie_get_account: "Switch accounts to compare balances.",
  find_nearby_atms: "Open the map on OpenStreetMap for directions.",
  find_nearby_branches: "Open the map on OpenStreetMap for directions.",
  insight_climatewise: "You can open the full report for a breakdown of your emissions.",
  insight_financial_overview:
    "Review bills and spending together when you plan the month."
};

const DEFAULT_NEXT_STEP = "You can review the related details in your account activity.";

/**
 * Ensures deterministic answers honor the answer contract: a takeaway plus a
 * practical next step woven into the prose, with no labels.
 */
function withNextStep(name: string, text: string): string {
  if (typeof text !== "string" || text.trim().length === 0) return text;
  if (name === "insight_anomalies" && /^Nothing unusual/i.test(text)) return text;
  if (name === "insight_spending_breakdown" && /^I couldn't find any spending/i.test(text)) {
    return text;
  }
  const nextStep = INTENT_NEXT_STEPS[name] ?? DEFAULT_NEXT_STEP;
  if (text.includes(nextStep)) return text;
  return `${text} ${nextStep}`;
}

function checkingAccountId(session: Session): string {
  const checking = session.accounts.find((account) => account.type.toLowerCase() === "checking");
  return (checking ?? session.accounts[0])?.id ?? "";
}

/**
 * Account/card named in a suspicious-activity question, or "" for a broad
 * all-accounts question. Nicknames win; then card/credit, checking, savings.
 */
function anomalyAccountId(text: string, session: Session): string {
  const named = session.accounts.find((account) => {
    const nickname = account.nickname.trim().toLowerCase();
    return nickname.length > 0 && text.includes(nickname);
  });
  if (named) return named.id;

  const byType = (predicate: (type: string) => boolean): string => {
    const account = session.accounts.find((entry) => predicate(entry.type.toLowerCase()));
    return account?.id ?? "";
  };

  if (/\b(?:credit ?card|card)\b/.test(text)) {
    const credit = byType((type) => type.includes("credit"));
    if (credit) return credit;
  }
  if (/\bchecking\b/.test(text)) {
    const checking = byType((type) => type === "checking");
    if (checking) return checking;
  }
  if (/\bsavings?\b/.test(text)) {
    const savings = byType((type) => type === "savings");
    if (savings) return savings;
  }
  return "";
}

/** Spending category named in a prompt, matching the insight tool's buckets. */
export function detectSpendingCategory(text: string): string | null {
  const value = String(text ?? "").toLowerCase();
  if (/\bgrocer(?:y|ies)\b|\bsupermarket\b|\bfarmers market\b/.test(value)) return "groceries";
  if (/\bhousing\b|\brent\b|\bmortgage\b/.test(value)) return "housing";
  if (/\bdining\b|\brestaurants?\b|\bfood\b|\bcoffee\b/.test(value)) return "dining";
  if (/\btransport(?:ation)?\b|\btransit\b|\bgas\b|\bparking\b|\buber\b|\blyft\b/.test(value)) {
    return "transport";
  }
  if (/\butilit(?:y|ies)\b|\belectric(?:ity)?\b|\binternet\b|\bwater bill\b/.test(value)) {
    return "utilities";
  }
  if (/\bsubscriptions?\b/.test(value)) return "subscriptions";
  if (/\bshopping\b|\bamazon\b|\btarget\b/.test(value)) return "shopping";
  if (/\binsurance\b/.test(value)) return "insurance";
  if (/\bfitness\b|\bgym\b/.test(value)) return "fitness";
  return null;
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
  if (/\b(?:climatewise|climate|lorax|carbon|emissions?|co2|footprint)\b/.test(text)) {
    return {
      tool: "insight_climatewise",
      args: (session) => ({ customerId: session.customer.id, days: 90 })
    };
  }
  const ranked = /\b(?:biggest|largest|top|highest|most expensive)\b/.test(text);
  const category = detectSpendingCategory(text);
  if (ranked && (category || /\b(?:purchases?|expenses?|transactions?|charges?)\b/.test(text))) {
    return {
      tool: "insight_top_transactions",
      args: (session) => ({
        accountId: checkingAccountId(session),
        ...(category ? { category } : {}),
        months: 3,
        limit: 20
      })
    };
  }
  if (/\b(?:weird|anomal\w*|duplicate|suspicious|charg\w*|unusual|strange|odd|double)\b/.test(text)) {
    return {
      tool: "insight_anomalies",
      args: (session) => {
        const accountId = anomalyAccountId(text, session);
        return accountId
          ? { customerId: session.customer.id, accountId }
          : { customerId: session.customer.id };
      }
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
  if (/\b(?:where do i shop most|shop most|top merchant|favorite merchant|most frequent merchant)\b/.test(text)) {
    return {
      tool: "insight_top_merchants",
      args: (session) => ({
        accountId: checkingAccountId(session),
        months: 3,
        limit: 5
      })
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
  )}. ${coverage} The largest payment is due ${relativeDue(
    largest.daysUntil
  )}. Liquid balances including savings are ${money(
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
  const topCategory = String(categories[0]?.category ?? "").toLowerCase();

  // The pie card already shows the period, total, category amounts, and shares.
  // The prose adds only a qualitative read of what the mix means.
  if (topCategory === "housing") {
    return "Most of the latest full month is fixed housing cost, so the smaller day-to-day categories are where you have the most room to adjust.";
  }
  if (topCategory === "dining" || topCategory === "shopping") {
    return "Discretionary spending drives most of the latest full month, so those categories are the best place to look for savings.";
  }
  return "A few categories drive most of the latest full month, so the smaller day-to-day ones are where you have the most room to adjust.";
}

/** Join merchant names into a natural list: A; A and B; A, B, and C. */
function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** " on your Venture card" / " on your Everyday Checking" for a finding. */
function findingAccountPhrase(finding: AnyRecord): string {
  const label = String(finding.accountLabel ?? "").trim();
  if (!label) return "";
  const type = String(finding.accountType ?? "").toLowerCase();
  if (type.includes("credit")) {
    return /card$/i.test(label) ? ` on your ${label}` : ` on your ${label} card`;
  }
  return ` on your ${label}`;
}

/** Merchant plus its account label, e.g. "NETFLIX.COM on your Venture card". */
function findingLabel(finding: AnyRecord): string {
  const name = String(finding.description ?? "").trim() || "A charge";
  return `${name}${findingAccountPhrase(finding)}`;
}

function anomaliesAnswer(data: unknown): string {
  const payload = rec(data);
  const findings = Array.isArray(payload.findings) ? payload.findings.map(rec) : [];
  if (findings.length === 0) {
    return "Nothing unusual stood out across your accounts.";
  }
  const visible = findings.slice(0, 8);
  const duplicates = visible.filter((finding) => finding.type === "duplicate");
  const outliers = visible.filter((finding) => finding.type === "outlier");
  const others = visible.filter(
    (finding) => finding.type !== "duplicate" && finding.type !== "outlier"
  );
  const duplicateCount =
    typeof payload.duplicateCount === "number"
      ? payload.duplicateCount
      : findings.filter((finding) => finding.type === "duplicate").length;
  const outlierCount =
    typeof payload.outlierCount === "number"
      ? payload.outlierCount
      : findings.filter((finding) => finding.type === "outlier").length;

  const summary =
    typeof payload.summary === "string" && payload.summary.trim()
      ? payload.summary.trim()
      : summarizeAnomalyPatterns(duplicateCount, outlierCount);

  const parts: string[] = [summary];

  const duplicateLabels = duplicates.map(findingLabel);
  if (duplicateLabels.length > 0) {
    parts.push(
      duplicateLabels.length === 1
        ? `${duplicateLabels[0]} is a possible duplicate.`
        : `${joinNames(duplicateLabels)} each look like possible duplicates.`
    );
  }

  const outlierLabels = outliers.map(findingLabel);
  if (outlierLabels.length > 0) {
    parts.push(
      outlierLabels.length === 1
        ? `${outlierLabels[0]} is an unusually large purchase.`
        : `${joinNames(outlierLabels)} are unusually large purchases.`
    );
  }

  const otherLabels = others.map(findingLabel);
  if (otherLabels.length > 0) {
    parts.push(
      otherLabels.length === 1
        ? `${otherLabels[0]} also looks unusual.`
        : `${joinNames(otherLabels)} also look unusual.`
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

/** Search radius used by the ATM tool when anything is actually nearby. */
const ATM_NEARBY_RADIUS_MILES = 25;

function atmAnswer(data: unknown, location: string): string {
  const payload = rec(data);
  const count = num(payload.count);
  if (count === 0) {
    return `I couldn't find any ATMs matching "${location}". Nessie's demo ATM data only includes Arlington, VA.`;
  }

  const results = Array.isArray(payload.results) ? payload.results.map(rec) : [];
  const rawNearest = results[0]?.distanceMiles;
  const nearest =
    typeof rawNearest === "number" ? rawNearest : Number(rawNearest);

  // Coverage is decided primarily by the place the tool actually geocoded.
  // Falling back to the requested text keeps "Arlington" prompts covered even
  // when geocoding is unavailable, and the distance check covers the remaining
  // case where the nearest row is clearly outside the demo footprint.
  const resolvedLabel = rec(payload.resolvedLocation).label;
  let covered: boolean;
  if (typeof resolvedLabel === "string" && resolvedLabel.trim()) {
    covered = /arlington/i.test(resolvedLabel);
  } else if (/arlington/i.test(location)) {
    covered = true;
  } else {
    covered = Number.isFinite(nearest) && nearest <= ATM_NEARBY_RADIUS_MILES;
  }

  if (!covered) {
    return `Nessie's demo ATM data only includes Arlington, VA, so I can't show ATMs in "${location}". Here's an Arlington ATM instead.`;
  }

  const displayLocation =
    /arlington/i.test(location) && /\b(?:va|virginia)\b/i.test(location)
      ? location
      : "Arlington, VA";
  return `I found ${count} ATMs near "${displayLocation}". The nearest options are shown here, with straight-line distances from the search location.`;
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

function recurringAnswer(data: unknown): string {
  const payload = rec(data);
  const count = num(payload.count);
  if (count === 0) return "I don't see any recurring charges on this account.";
  return `I found ${count} recurring charges on this account. They repeat at a steady amount across months, which is typical of subscriptions and memberships.`;
}

function topTransactionsAnswer(data: unknown): string {
  const payload = rec(data);
  const count = num(payload.count);
  const months = num(payload.months) || 3;
  const category = String(payload.category ?? "").trim().toLowerCase();
  // Groceries reads naturally as "grocery transactions"; other categories use
  // the category name as-is. No merchant names are repeated from the card.
  const scope = category ? `${category === "groceries" ? "grocery" : category} ` : "";
  if (count === 0) {
    return `I couldn't find any ${scope}transactions in the last ${months} months.`;
  }
  return `I found ${count} ${scope}transactions in the last ${months} months, shown largest first.`;
}

function loanType(loan: AnyRecord): string {
  const label = String(loan.type ?? loan.description ?? "").trim();
  return label || "loan";
}

function loansAnswer(data: unknown): string {
  const payload = rec(data);
  const loans = Array.isArray(payload.items) ? payload.items.map(rec) : [];
  if (loans.length === 0) {
    return "I don't see any active loans on this account.";
  }
  if (loans.length === 1) {
    const only = loanType(loans[0] ?? {});
    return `You have one active loan, the ${only}. It’s your only fixed loan payment.`;
  }

  // The loan card shows the factual balance and monthly payment of the largest
  // loan, so prose compares the obligations instead of restating amounts.
  const names = loans.map(loanType);
  const byBalance = [...loans].sort((a, b) => num(b.amount) - num(a.amount))[0] ?? {};
  const byPayment = [...loans].sort(
    (a, b) => num(b.monthlyPayment) - num(a.monthlyPayment)
  )[0] ?? {};
  const balanceType = loanType(byBalance);
  const paymentType = loanType(byPayment);
  const comparison =
    balanceType === paymentType
      ? `The ${balanceType} has the larger balance and monthly payment.`
      : `The ${balanceType} has the larger balance, while the ${paymentType} has the larger monthly payment.`;

  return `You have ${loans.length} loans: ${joinNames(names)}. ${comparison} Together they make up a fixed monthly obligation.`;
}

function topMerchantsAnswer(data: unknown): string {
  const payload = rec(data);
  const items = Array.isArray(payload.items) ? payload.items.map(rec) : [];
  const months = num(payload.months) || 3;
  if (items.length === 0) {
    return "I couldn’t find any merchant activity in the last three months.";
  }
  const name = String(items[0]?.name ?? "").trim();
  if (!name) {
    return "Your most frequent merchant is shown here, based on how often you visited it.";
  }
  return `Your most frequent merchant is ${name}, with more visits than any other merchant in the last ${months} months. That makes it the clearest picture of your everyday spending.`;
}

/**
 * ClimateWise prose. The full adaptive card already shows the score, tier,
 * total kg, category ring, and purchase rows, so the answer adds interpretation
 * and a nudge instead of restating any of those values.
 */
function climateAnswer(data: unknown): string {
  const payload = rec(data);
  const categories = (Array.isArray(payload.categories) ? payload.categories : []).map(rec);
  const hasEmissions = categories.some((category) => num(category.kg) > 0);
  if (num(payload.purchaseCount) === 0 || !hasEmissions) {
    return "I don't see enough purchase data in this window to estimate your carbon footprint yet.";
  }

  const nudges = (Array.isArray(payload.nudges) ? payload.nudges : []).map(rec);
  const tip = String(nudges[0]?.title ?? "").trim();
  const opportunity = tip
    ? ` You can ${tip.charAt(0).toLowerCase()}${tip.slice(1)} to make the biggest dent.`
    : "";

  return `Your everyday purchases add up to a meaningful footprint, and small habit changes can bring it down.${opportunity}`;
}

function cashflowAnswer(data: unknown, now: Date): string {
  const payload = rec(data);
  const buckets = (Array.isArray(payload.monthlyCashflow) ? payload.monthlyCashflow : [])
    .map(rec)
    .filter((bucket): bucket is AnyRecord & { month: string } => typeof bucket.month === "string");
  if (buckets.length === 0) {
    return "I don't see enough cash flow history here yet.";
  }
  const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const complete = buckets.filter((bucket) => bucket.month < currentKey);
  const latest = complete[complete.length - 1] ?? buckets[buckets.length - 1] ?? {};
  if (num(latest.net) > 0) {
    return "Your latest month is cash-flow positive, with income ahead of spending. You can build on that by moving the surplus to savings.";
  }
  return "Your latest month is cash-flow negative, with spending ahead of income. You can review the largest outflows in the app.";
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

export function composeAnswer(name: string, data: unknown, now: Date, message: string): string {
  switch (name) {
    case "insight_upcoming_bills":
      return billsAnswer(data);
    case "insight_spending_breakdown":
      return spendingAnswer(data, now);
    case "insight_top_transactions":
      return topTransactionsAnswer(data);
    case "insight_recurring_charges":
      return recurringAnswer(data);
    case "insight_anomalies":
      return anomaliesAnswer(data);
    case "insight_top_merchants":
      return topMerchantsAnswer(data);
    case "insight_climatewise":
      return climateAnswer(data);
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
      return /\b(?:cash ?flow|inflow|outflow|net cash)\b/i.test(message)
        ? cashflowAnswer(data, now)
        : overviewAnswer(data);
    default:
      return overviewAnswer(data);
  }
}

/**
 * Grounded narration for the single-tool fast path. Bills deliberately avoids
 * repeating the dollar totals and the payee/amount/due date already shown on
 * the card, matching the product rule that prose must not duplicate card
 * values; it uses relative timing as the analysis instead.
 */
function billsFastAnswer(data: unknown): string {
  const payload = rec(data);
  const bills = Array.isArray(payload.bills) ? payload.bills.map(rec) : [];
  if (bills.length === 0 || num(payload.count) === 0) {
    return "I don't see any bills due in the next 30 days for this customer.";
  }
  const largest = [...bills].sort((a, b) => num(b.amount) - num(a.amount))[0] ?? {};
  const coverage =
    num(payload.shortfall) > 0
      ? "Your checking balance is slightly short of covering them all, but savings can cover the difference."
      : "Your checking balance covers them.";
  return `You have ${num(payload.count)} bills due in the next 30 days. ${coverage} The largest payment is due ${relativeDue(
    largest.daysUntil
  )}.`;
}

/** Deterministic answer used when a known single-tool intent is answered locally. */
export function composeFastAnswer(
  name: string,
  data: unknown,
  now: Date,
  message: string
): string {
  if (name === "insight_upcoming_bills") return withNextStep(name, billsFastAnswer(data));
  return withNextStep(name, composeAnswer(name, data, now, message));
}

/** A short leading sentence that invites the card without restating its values. */
export function composeIntro(name: string): string {
  switch (name) {
    case "insight_spending_breakdown":
      return "Here is your top spending by category:";
    case "insight_upcoming_bills":
      return "Here is what's coming up:";
    case "insight_anomalies":
      return "Here is what stood out:";
    case "insight_top_transactions":
      return "Here are your biggest matching transactions:";
    case "insight_recurring_charges":
      return "Here are the subscriptions I found:";
    case "insight_top_merchants":
      return "Here is where you shop most:";
    case "insight_climatewise":
      return "Here’s what goes into your LORAX® Score:";
    case "nessie_list_account_deposits":
    case "nessie_list_account_withdrawals":
    case "nessie_list_account_transactions":
      return "Here are the latest entries:";
    case "nessie_list_customer_accounts":
    case "nessie_get_account":
      return "Here is a look at your accounts:";
    case "find_nearby_atms":
      return "Here are the closest ATMs I found:";
    case "find_nearby_branches":
      return "Here is what's nearby:";
    case "insight_financial_overview":
      return "Here is your financial snapshot:";
    default:
      return "Here is what I found:";
  }
}

export async function mockAgent({ session, message, emit, deps }: MockAgentInput): Promise<void> {
  if (session.customer.id === GUEST_CUSTOMER_ID) {
    const text = "You can explore account options and apply on the Capital One website. Are you interested in checking, savings, or a credit card?";
    emit({ type: "text", delta: text });
    session.contents = trimContents([
      ...session.contents,
      { role: "user", parts: [{ text: message }] },
      { role: "model", parts: [{ text }] }
    ]);
    session.updatedAt = Date.now();
    emit({ type: "usage", promptTokens: 0, outputTokens: 0, rounds: 1 });
    emit({ type: "done", sessionId: session.id });
    return;
  }
  const { callTool, now } = deps;
  const intent = routeIntent(message);
  const args = intent.args(session);

  emit({ type: "tool_start", name: intent.tool, label: toolLabel(intent.tool) });
  const startedAt = Date.now();

  let text: string;
  let intro = "";
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
      intro = composeIntro(intent.tool);
      emit({ type: "text", delta: intro });
      const accountId =
        typeof args.accountId === "string" && args.accountId.trim().length > 0
          ? args.accountId
          : "";
      emit({
        type: "insight",
        kind: intent.tool,
        payload: result.data,
        ...(accountId ? { accountId } : {})
      });
      text = withNextStep(intent.tool, composeAnswer(intent.tool, result.data, now(), message));
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

  const sessionText = intro ? `${intro}\n\n${text}` : text;
  session.contents = trimContents([
    ...session.contents,
    { role: "user", parts: [{ text: message }] },
    { role: "model", parts: [{ text: sessionText }] }
  ]);
  session.updatedAt = Date.now();

  emit({ type: "usage", promptTokens: 0, outputTokens: 0, rounds: 1 });
  emit({ type: "done", sessionId: session.id });
}

export type MockAgentEvent = AgentEvent;
