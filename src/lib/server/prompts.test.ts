import { describe, expect, it } from "vitest";
import { buildSystemInstruction } from "./prompts";

describe("buildSystemInstruction", () => {
  it("carries the selected customer and account ids into the prompt", () => {
    const instruction = buildSystemInstruction(
      { id: "cust-maya", firstName: "Maya", lastName: "Chen" },
      [
        { id: "acct-checking", nickname: "Everyday Checking", type: "Checking", balance: 4218 },
        { id: "acct-savings", nickname: "Emergency Fund", type: "Savings", balance: 12640 }
      ],
      "2026-11-14"
    );

    expect(instruction).toContain("Selected customer id: cust-maya.");
    expect(instruction).toContain("Everyday Checking (Checking) id=acct-checking balance=$4,218");
    expect(instruction).toContain("Emergency Fund (Savings) id=acct-savings balance=$12,640");
    expect(instruction).toContain(
      "Do NOT call nessie_list_customers; the customer is already selected."
    );
    expect(instruction).toContain(
      "For \"last month\" spending, use insight_spending_breakdown and quote the monthlyBreakdown entry for that month (categories + total)."
    );
    expect(instruction).toContain(
      "For spending, anomalies, and recurring-charge questions, default to the checking account unless the customer names a specific card or account. Do not analyze every account."
    );
    expect(instruction).toContain(
      "Recurring obligations are not anomalies. Do not present rent, utilities, or subscriptions as unusual just because they are large."
    );
    expect(instruction).toContain(
      "If coverageRatio is greater than 2, say the bill is covered; do not quote the ratio."
    );
    expect(instruction).toContain(
      "Do not call raw nessie_list_account_* tools unless the customer asks about individual transactions; the insight tools are the source of truth."
    );
    expect(instruction).toContain("Avoid markdown headings (#)");
    expect(instruction).toContain("Capital One's virtual assistant");
    expect(instruction).toContain("Use the category breakdown as returned.");
    expect(instruction).toContain(
      'Describe anomalies as "possible duplicate" or "unusually large purchase". Never mention medians, MAD, thresholds, statistical outliers, tool names, data sources, categorization methods, or estimation unless the customer explicitly asks.'
    );
    expect(instruction).not.toContain("Spending categories are estimated from descriptions.");
    expect(instruction).not.toContain("read-only demo");
    expect(instruction).not.toContain("hackathon");
  });
});
