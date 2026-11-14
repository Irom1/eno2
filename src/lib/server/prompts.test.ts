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
    expect(instruction).toContain(
      'ATM coverage: The Nessie demo ATM dataset only contains ATMs in Arlington, VA.'
    );
    expect(instruction).toContain(
      'Never claim or imply that ATMs exist in the requested city.'
    );
    expect(instruction).toContain("Avoid markdown headings (#)");
    expect(instruction).toContain(
      'Cards already show account names, balances, amounts, dates, statuses, and rows. Do NOT restate any value, name, date, or row visible in a card.'
    );
    expect(instruction).toContain(
      'Exception: when an inline single-entity card introduces a merchant or payee, name that merchant or payee in the sentence that introduces its card; still do not restate its amount, date, status, or row.'
    );
    expect(instruction).toContain(
      'Answer in two to five sentences or a short bullet list, including one insight and one tip.'
    );
    expect(instruction).toContain(
      'Every answer must include at least one insight and one practical tip.'
    );
    expect(instruction).toContain(
      'For a spending-by-category answer, write one short intro sentence before calling insight_spending_breakdown so the category chart follows it, then add a takeaway/tip after the chart; do not restate the chart\'s amounts or shares.'
    );
    expect(instruction).toContain(
      'Cards are simple, primitive data displays: one entity or one basic series.'
    );
    expect(instruction).toContain(
      'Do not rely on a card to carry analysis, rankings, recommendations, or combined insights.'
    );
    expect(instruction).toContain(
      'Prefer the smallest primitive card(s) needed, and put the novel insight, comparison, and tip in the prose.'
    );
    expect(instruction).toContain(
      'For a single bill or account, use one primitive card; never render an account list. Leave totals, coverage, and account comparisons in the prose.'
    );
    expect(instruction).toContain(
      'For a single loan, location, or recurring charge, use one primitive card and keep lists, comparisons, and the tip in the prose; the card shows only the factual data.'
    );
    expect(instruction).toContain(
      "Do not state a recurring charge's cadence or next date unless a tool returns them."
    );
    expect(instruction).toContain(
      'For rewards, a savings goal, or monthly cashflow, show one primitive card with one balance, target, or month; keep comparisons, progress narratives, and advice in the prose, and do not repeat the card\'s values.'
    );
    expect(instruction).toContain(
      'For merchants and profiles, show one primitive card at most: one merchant or one customer.'
    );
    expect(instruction).toContain(
      'Keep merchant lists and multiple customers in the prose, never put account or contact identifiers in the card, and keep the insight and tip in the prose.'
    );
    expect(instruction).toContain(
      'Do not ask for or describe a broad “everything” card.'
    );
    expect(instruction).toContain(
      'The insight explains what the data means or what stands out.'
    );
    expect(instruction).toContain(
      'The tip is a safe, concrete next step, phrased as an option (“you can …”) rather than an instruction (“you should …”).'
    );
    expect(instruction).toContain(
      'Never return only a card or a bare tool result.'
    );
    expect(instruction).toContain(
      'Do not repeat information already visible in a card: amounts, balances, dates, names, statuses, or rows.'
    );
    expect(instruction).toContain(
      'You have a suspiciously large transaction at APPLE and a possible duplicate transaction at Netflix.'
    );
    expect(instruction).toContain(
      'Put the reason in the prose; the transaction card shows only the transaction details.'
    );
    expect(instruction).toContain(
      'call present_card({kind,id}) before the sentence that mentions it. Call it at most twice per turn, only for single entities, never for lists or when the id is unknown. Do not describe the card or repeat its data.'
    );
    expect(instruction).not.toContain('or no prose.');
    expect(instruction).toContain(
      'Bad: "Your Venture card has a $50 balance." (the card shows both)'
    );
    expect(instruction).toContain(
      'Good: "This is your only card." / "You\'re close to your next reward."'
    );
    expect(instruction).toContain(
      'An amount, date, status, or row should appear only as part of analysis, never as a bare restatement.'
    );
    expect(instruction).toContain(
      'Bad: "The largest is MIT Bursar, due 2026-12-05." (the card already shows that bill and due date)'
    );
    expect(instruction).toContain(
      'Good: "The largest payment is due within the next three weeks." (analysis/timing, not a restatement)'
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
