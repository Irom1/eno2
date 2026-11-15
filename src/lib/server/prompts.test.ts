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
      "For suspicious-activity questions, scan all customer accounts by passing customerId (checking, savings, and credit cards) unless the customer names a specific account or card; for spending, loans, and recurring-charge questions, default to the checking account unless the customer names a specific card or account. Do not analyze every account for non-anomaly questions. For loans, call nessie_list_account_loans once on the checking account; do not repeat it for other accounts."
    );
    expect(instruction).toContain(
      "Recurring obligations are not anomalies. Do not present rent, utilities, or subscriptions as unusual just because they are large."
    );
    expect(instruction).toContain(
      "If coverageRatio is greater than 2, say the bill is covered; do not quote the ratio."
    );
    expect(instruction).toContain(
      "Use raw nessie_list_account_* tools for individual transaction questions and when a multi-transaction list is the best answer; the insight tools remain the source of truth for aggregates."
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
      'Be concise. Lead with the direct answer, then the supporting number. If a tool returns nothing, say so honestly: there may simply be no data for this customer.'
    );
    expect(instruction).toContain("Cards are the default way to show record data.");
    expect(instruction).toContain(
      'Cards are simple, primitive data displays: one entity or one basic series.'
    );
    expect(instruction).toContain(
      'Do not rely on a card to carry analysis, rankings, recommendations, or combined insights.'
    );
    expect(instruction).toContain(
      'Prefer the smallest primitive card(s) needed, and put the analysis, comparison, and next step in the prose.'
    );
    expect(instruction).toContain(
      'For a single bill or account, use one primitive card; never render an account list. Leave totals, coverage, and account comparisons in the prose.'
    );
    expect(instruction).toContain(
      'For a single loan, location, or recurring charge, use one primitive card; if several are relevant, show the card for the one you discuss and summarize the rest briefly instead of listing rows.'
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
      'Keep merchant lists and multiple customers in the prose because there is no list card; never put account or contact identifiers in the card.'
    );
    expect(instruction).toContain(
      'Do not ask for or describe a broad “everything” card.'
    );
    expect(instruction).toContain(
      'Leave the customer with something they learned and a practical next step, woven naturally into the prose.'
    );
    expect(instruction).toContain('Do not label these parts');
    expect(instruction).toContain(
      'offer a safe, concrete option (“you can …”) rather than an instruction (“you should …”).'
    );
    expect(instruction).toContain(
      'Never return only a card or a bare tool result.'
    );
    expect(instruction).toContain(
      'Do not repeat information already visible in a card: amounts, balances, dates, names, statuses, or rows.'
    );
    expect(instruction).toContain(
      'then explain every card: name each flagged merchant, say whether it is a possible duplicate or an unusually large purchase'
    );
    expect(instruction).toContain(
      'Every card must be explained in the prose: say what it supports or why it matters.'
    );
    expect(instruction).toContain(
      'A card is evidence for your insight, not a standalone list item.'
    );
    expect(instruction).toContain(
      'Bad: "There\'s a possible duplicate NETFLIX charge for $19 on 2026-10-28, earlier on 2026-10-27."'
    );
    expect(instruction).toContain(
      'Good: "There are several unusually large purchases and a possible duplicate. On your Venture card, NETFLIX is a possible duplicate; on checking, APPLE STORE, OVERSEAS ELECTRONICS, and EXPRESS AIR FREIGHT are unusually large purchases."'
    );
    expect(instruction).toContain(
      'For suspicious-activity questions, scan all customer accounts by passing customerId (checking, savings, and credit cards) unless the customer names a specific account or card'
    );
    expect(instruction).toContain(
      'pass customerId to scan all accounts (checking, savings, credit cards) for broad suspicious-activity questions, or accountId for one account.'
    );
    expect(instruction).toContain(
      'For suspicious activity, start with a one-sentence synopsis of the patterns (for example, "several unusually large purchases and a possible duplicate"), then explain every card'
    );
    expect(instruction).toContain(
      'name each flagged merchant, say whether it is a possible duplicate or an unusually large purchase, and name the account/card when the findings span accounts.'
    );
    expect(instruction).toContain(
      'call present_card({kind,id}) before the sentence that mentions it. Call it at most twice per turn, only for single entities, never for lists or when the id is unknown. For several transactions, use the deposit and withdrawal tools so the transaction list card renders instead of calling present_card for each row. Do not describe the card or repeat its data.'
    );
    expect(instruction).toContain(
      'For several transactions, use the deposit and withdrawal tools so the transaction list card renders'
    );
    expect(instruction).not.toContain(
      'Every answer must include at least one insight and one practical tip'
    );
    expect(instruction).not.toContain('Prefer short bold labels and bullet lists');
    expect(instruction).toContain(
      'Never write labels like “Insight:” or “Tip:”.'
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
      'Write one short introductory sentence before the card and one concise takeaway after it; both must add information the card does not show.'
    );
    expect(instruction).toContain(
      'Do not repeat card values, names, dates, statuses, or rows.'
    );
    expect(instruction).toContain(
      'Use a list card only when the tool returns the exact rows you are discussing. For ranked, category, or merchant-filtered purchase questions, call insight_top_transactions; never build a list card from a raw transaction feed that has different rows.'
    );
    expect(instruction).toContain(
      'For a filtered transaction list, you may name the merchants to explain the pattern, but do not restate their amounts or dates.'
    );
    expect(instruction).toContain(
      '- insight_top_transactions for the biggest purchases in a category or at a merchant; returns the exact rows for the transaction list card.'
    );
    expect(instruction).toContain(
      '- insight_top_merchants for where the customer shops most; returns the top merchant for a merchant card.'
    );
    expect(instruction).toContain(
      "- insight_climatewise for the ClimateWise/LORAX score, purchase emissions, and the biggest emitting categories."
    );
    expect(instruction).toContain(
      "For a ClimateWise question, call insight_climatewise and show the single climate card; explain what the score means and name the biggest emitting category and one nudge, but do not restate the card's score, tier, kilograms, or days."
    );
    expect(instruction).toContain(
      "For a spending pie, do not restate the period, total, category amounts, shares, or transaction count. Explain what the mix means (fixed vs discretionary) and give one next step."
    );
    expect(instruction).toContain(
      "For a loan card, do not restate the loan's balance or monthly payment. Compare which loan is larger, how many loans there are, or the fixed obligation; the card shows the factual fields."
    );
    expect(instruction).toContain(
      "For a rewards question, do not state the points or miles total; the reward card shows it. Say which card earns them and how to redeem them."
    );
    expect(instruction).toContain(
      "For a cashflow card, say whether the month was cash-flow positive or negative and what it means; do not restate the month or the inflow/outflow/net values."
    );
    expect(instruction).toContain(
      "If the customer asks about a savings goal and no target is set, say you don't see a goal set and ask for a target amount. Do not invent a target or show a goal card."
    );
    expect(instruction).toContain(
      "For a top-merchant question, use insight_top_merchants and show one merchant card; do not use the spending pie or a transaction list."
    );
    expect(instruction).toContain(
      'Bad: "The auto loan has an $18,500 balance and $412 monthly payment; the student loan has $12,400 and $180."'
    );
    expect(instruction).toContain(
      'Good: "You have two loans; the auto loan carries the larger balance and payment. Both add a fixed monthly obligation."'
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
