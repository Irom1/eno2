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
    expect(instruction).toContain(
      'For a specific topic (loans, transactions, rewards, bills, recurring, spending, locations), call the specific tool directly. Do not call insight_financial_overview as a preamble or to look up ids unless the user asks for an overview/snapshot or cross-account context is required. Do not query every account for a single-account question. Use the fewest tools needed.'
    );
    expect(instruction).toContain(
      'For a credit-card question, show only credit-card accounts; do not include checking or savings unless the customer also asks for accounts.'
    );
    expect(instruction).toContain("Avoid markdown headings (#)");
    expect(instruction).toContain(
      'Cards already show account names, balances, amounts, dates, statuses, and rows. Do NOT restate any value, name, date, or row visible in a card.'
    );
    expect(instruction).toContain(
      'Exception: when an inline single-entity card introduces a merchant or payee, name that merchant or payee in the sentence that introduces its card; still do not restate its amount, date, status, or row.'
    );
    expect(instruction).toContain(
      'Every answer must include at least one explanation or insight sentence.'
    );
    expect(instruction).toContain(
      'Never return only a card or a bare tool result.'
    );
    expect(instruction).toContain(
      'You have a suspiciously large transaction at APPLE and a possible duplicate transaction at Netflix.'
    );
    expect(instruction).toContain(
      'The transaction card shows only the transaction; put the reason in the prose.'
    );
    expect(instruction).not.toContain('or no prose.');
    expect(instruction).toContain(
      'Bad: "Your Venture card has a $50 balance." (the card shows both)'
    );
    expect(instruction).toContain(
      'Good: "This is your only card." / "You\'re close to your next reward."'
    );
    expect(instruction).toContain(
      'Cards render inline with your prose. When a card will help, write one short introductory sentence before calling the tool, then let the card render, then add a concise takeaway that explains what stands out.'
    );
    expect(instruction).toContain(
      'Both sentences must add information the card does not show: a comparison, what it means, or a next step.'
    );
    expect(instruction).toContain(
      'Do not repeat card values, names, dates, or rows.'
    );
    expect(instruction).toContain(
      'A transaction list card may be used for multi-transaction answers; introduce it in one short sentence without repeating the row amounts or dates.'
    );
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
