import { describe, expect, it } from "vitest";
import type { AgentEvent } from "./events";
import type { ToolCallResult } from "./mcp";
import { composeFastAnswer, composeIntro, mockAgent, routeIntent, type MockAgentDeps } from "./mockAgent";
import { createSession } from "./session";

const customer = { id: "cust-1", firstName: "Maya", lastName: "Chen" };
const accounts = [
  {
    id: "acct-1",
    type: "Checking",
    nickname: "Everyday",
    balance: 4218,
    rewards: 0,
    accountNumber: "****1234"
  }
];

const billsPayload = {
  asOf: "2026-11-14",
  days: 30,
  count: 8,
  total: 4283.59,
  liquidBalance: 16858,
  checkingBalance: 4218,
  shortfall: 65.59,
  covered: false,
  bills: [
    { payee: "Rent", amount: 1650, dueDate: "2026-11-20", daysUntil: 6 },
    { payee: "Electric", amount: 120, dueDate: "2026-11-21", daysUntil: 7 }
  ]
};

const spendingPayload = {
  months: 3,
  monthlyTotals: [
    { month: "2026-09", total: 2100 },
    { month: "2026-10", total: 2470 },
    { month: "2026-11", total: 0 }
  ],
  monthlyBreakdown: [
    {
      month: "2026-09",
      total: 2100,
      transactionCount: 18,
      categories: [{ category: "housing", total: 2100, share: 1 }]
    },
    {
      month: "2026-10",
      total: 2470,
      transactionCount: 20,
      categories: [
        { category: "shopping", total: 1800, share: 0.7287 },
        { category: "groceries", total: 670, share: 0.2713 }
      ]
    },
    { month: "2026-11", total: 0, transactionCount: 0, categories: [] }
  ],
  categories: [
    { category: "shopping", total: 1800, share: 0.4 },
    { category: "groceries", total: 900, share: 0.2 }
  ],
  topDescriptions: [],
  largestTransactions: [],
  monthOverMonth: { from: "2026-09", to: "2026-10", delta: 370, pctChange: 17.62 },
  transactionCount: 20,
  totalSpend: 6000,
  averageTransaction: 300
};

function ok(data: unknown): ToolCallResult {
  return { ok: true, data, text: JSON.stringify(data) };
}

async function run(
  message: string,
  callTool: MockAgentDeps["callTool"]
): Promise<{ events: AgentEvent[]; text: string }> {
  const session = createSession(customer, accounts);
  const events: AgentEvent[] = [];
  await mockAgent({
    session,
    message,
    emit: (event) => events.push(event),
    deps: { callTool, now: () => new Date("2026-11-14T12:00:00Z") }
  });
  const text = events
    .filter((event): event is Extract<AgentEvent, { type: "text" }> => event.type === "text")
    .map((event) => event.delta)
    .join("");
  return { events, text };
}

const climatePayload = {
  asOf: "2026-11-14",
  days: 90,
  totalKg: 412.35,
  totalSpend: 3000,
  purchaseCount: 42,
  score: 712,
  tier: "Good",
  categories: [
    { id: "transport", label: "Travel & transport", kg: 180.2, share: 0.43 },
    { id: "food", label: "Food & dining", kg: 120.5, share: 0.29 }
  ],
  nudges: [
    {
      category: "transport",
      title: "Swap two drives a week for the T or a bike",
      body: "Travel & transport: 44% of your purchase footprint.",
      savingKgPerMonth: 6
    }
  ]
};

describe("mockAgent", () => {
  it("routes bills questions and emits ordered events with exact figures", async () => {
    const { events, text } = await run("What's due before my next paycheck and can I cover it?", async (name) => {
      expect(name).toBe("insight_upcoming_bills");
      return ok(billsPayload);
    });

    const types = events.map((event) => event.type);
    expect(types).toEqual(["tool_start", "tool_result", "text", "insight", "text", "usage", "done"]);

    const introIndex = events.findIndex(
      (event) => event.type === "text" && event.delta.includes("Here is what's coming up:")
    );
    const insightIndex = events.findIndex((event) => event.type === "insight");
    const answerIndex = events.findIndex(
      (event, index) => index > insightIndex && event.type === "text"
    );
    expect(introIndex).toBeGreaterThanOrEqual(0);
    expect(introIndex).toBeLessThan(insightIndex);
    expect(insightIndex).toBeLessThan(answerIndex);
    expect(text).toContain("Here is what's coming up:");

    expect(text).toContain("8 bills");
    expect(text).toContain("4,283.59");
    expect(text).toContain("4,218");
    expect(text).toContain("65.59");
    expect(text).toContain("largest payment");
    expect(text).toContain("within the next week");
    expect(text).not.toContain("Rent");
    expect(text).not.toContain("1,650");
    expect(text).not.toContain("2026-11-20");
    const nextStep =
      "If you want to cover the shortfall, you can move money to checking before the due dates.";
    expect(text).toContain(nextStep);
    expect(text).not.toContain("Tip:");
    expect(text).not.toContain("Insight:");
    const advice = text.slice(text.indexOf(nextStep));
    expect(advice).not.toContain("4,283.59");
    expect(advice).not.toContain("4,218");
    expect(advice).not.toContain("65.59");
    expect(text).not.toContain("not financial advice");
    expect(text).not.toContain("read-only");
  });

  it("keeps fast bill prose analytical instead of restating card fields", () => {
    const text = composeFastAnswer(
      "insight_upcoming_bills",
      billsPayload,
      new Date("2026-11-14T12:00:00Z"),
      "Show me my bills"
    );

    expect(text).toContain("largest payment");
    expect(text).toContain("within the next week");
    expect(text).toContain(
      "If you want to cover the shortfall, you can move money to checking before the due dates."
    );
    expect(text).not.toContain("Tip:");
    expect(text).not.toContain("Insight:");
    expect(text).not.toContain("Rent");
    expect(text).not.toContain("1,650");
    expect(text).not.toContain("2026-11-20");
  });

  it("gives a qualitative spending insight instead of restating the pie card", async () => {
    const { text } = await run("Where did my money go?", async (name) => {
      expect(name).toBe("insight_spending_breakdown");
      return ok(spendingPayload);
    });

    expect(text).toContain("Discretionary spending drives most of the latest full month");
    expect(text).toContain("those categories are the best place to look for savings.");
    const nextStep = "You can open a category in Activity to see the transactions behind it.";
    expect(text).toContain(nextStep);
    expect(text).not.toContain("$2,470");
    expect(text).not.toContain("$1,800");
    expect(text).not.toContain("59%");
    expect(text).not.toContain("October 2026");
    expect(text).not.toContain("November 2026");
    expect(text).not.toContain("20 transactions");
    expect(text).not.toContain("Tip:");
    expect(text).not.toContain("Insight:");
    expect(text).not.toContain("estimated");
  });

  it("reads a housing-led month as fixed cost with room to adjust elsewhere", () => {
    const text = composeFastAnswer(
      "insight_spending_breakdown",
      {
        monthlyTotals: [
          { month: "2026-09", total: 2470 },
          { month: "2026-10", total: 2470 }
        ],
        monthlyBreakdown: [
          {
            month: "2026-10",
            total: 2470,
            transactionCount: 20,
            categories: [{ category: "housing", total: 1450, share: 0.587 }]
          }
        ],
        categories: []
      },
      new Date("2026-11-14T12:00:00Z"),
      "Where did my money go last month?"
    );
    expect(text).toContain("Most of the latest full month is fixed housing cost");
    expect(text).toContain(
      "You can open a category in Activity to see the transactions behind it."
    );
  });

  it("does not append a spending next step when there is no spending data", () => {
    const text = composeFastAnswer(
      "insight_spending_breakdown",
      { monthlyTotals: [], monthlyBreakdown: [], categories: [] },
      new Date("2026-11-14T12:00:00Z"),
      "Where did my money go?"
    );
    expect(text).toBe("I couldn't find any spending in the last three months for this account.");
  });

  it("describes cashflow direction without restating the card values", () => {
    const payload = {
      monthlyCashflow: [
        { month: "2026-09", inflow: 6000, outflow: 5000, net: 1000 },
        { month: "2026-10", inflow: 6000, outflow: 5200, net: 800 }
      ]
    };
    const text = composeFastAnswer(
      "insight_financial_overview",
      payload,
      new Date("2026-11-14T12:00:00Z"),
      "How is my cash flow?"
    );
    expect(text).toContain("Your latest month is cash-flow positive");
    expect(text).toContain("income ahead of spending");
    expect(text).toContain("moving the surplus to savings");
    expect(text).not.toContain("2026-10");
    expect(text).not.toContain("6,000");
    expect(text).not.toContain("5,200");
    expect(text).not.toContain("800");
  });

  it("flags a negative cashflow month without quoting the amounts", () => {
    const text = composeFastAnswer(
      "insight_financial_overview",
      {
        monthlyCashflow: [
          { month: "2026-09", inflow: 6000, outflow: 5000, net: 1000 },
          { month: "2026-10", inflow: 5000, outflow: 5600, net: -600 }
        ]
      },
      new Date("2026-11-14T12:00:00Z"),
      "What is my net cash this month?"
    );
    expect(text).toContain("Your latest month is cash-flow negative");
    expect(text).toContain("spending ahead of income");
    expect(text).toContain("review the largest outflows in the app");
    expect(text).not.toContain("5,600");
    expect(text).not.toContain("600");
  });

  it("explains every anomaly across accounts with a synopsis", async () => {
    const findings = [
      {
        type: "duplicate",
        description: "NETFLIX.COM",
        amount: 19,
        date: "2026-10-28",
        duplicateOf: "2026-10-27",
        accountId: "card-1",
        accountLabel: "Venture",
        accountType: "credit card"
      },
      {
        type: "duplicate",
        description: "LOCAL BOOKSTORE",
        amount: 47,
        date: "2026-11-05",
        duplicateOf: "2026-11-04",
        accountId: "acct-1",
        accountLabel: "Everyday Checking",
        accountType: "checking"
      },
      {
        type: "outlier",
        description: "APPLE STORE",
        amount: 1800,
        date: "2026-10-13",
        accountId: "acct-1",
        accountLabel: "Everyday Checking",
        accountType: "checking"
      },
      {
        type: "outlier",
        description: "OVERSEAS ELECTRONICS PURCHASE",
        amount: 1250,
        date: "2026-10-21",
        accountId: "card-1",
        accountLabel: "Venture",
        accountType: "credit card"
      },
      {
        type: "outlier",
        description: "EXPRESS AIR FREIGHT",
        amount: 925,
        date: "2026-09-21",
        accountId: "acct-1",
        accountLabel: "Everyday Checking",
        accountType: "checking"
      }
    ];
    const { events, text } = await run(
      "Anything weird in my transactions?",
      async (name, args) => {
        expect(name).toBe("insight_anomalies");
        expect(args).toEqual({ customerId: "cust-1" });
        return ok({
          count: findings.length,
          duplicateCount: 2,
          outlierCount: 3,
          summary: "I found several unusually large purchases and several possible duplicates.",
          findings
        });
      }
    );

    expect(text).toContain(
      "I found several unusually large purchases and several possible duplicates."
    );
    expect(text).toContain("NETFLIX.COM on your Venture card");
    expect(text).toContain("LOCAL BOOKSTORE on your Everyday Checking");
    expect(text).toContain("each look like possible duplicates.");
    expect(text).toContain("APPLE STORE on your Everyday Checking");
    expect(text).toContain("OVERSEAS ELECTRONICS PURCHASE on your Venture card");
    expect(text).toContain("EXPRESS AIR FREIGHT on your Everyday Checking");
    expect(text).toContain("are unusually large purchases.");
    for (const finding of findings) {
      expect(text).toContain(finding.description);
    }
    for (const amount of ["$19", "$47", "$1,800", "$1,250", "$925"]) {
      expect(text).not.toContain(amount);
    }
    for (const date of [
      "2026-10-28",
      "2026-10-27",
      "2026-11-05",
      "2026-11-04",
      "2026-10-13",
      "2026-10-21",
      "2026-09-21"
    ]) {
      expect(text).not.toContain(date);
    }
    const nextStep = "If you don’t recognize a charge, you can review and dispute it in the app.";
    expect(text).toContain(nextStep);
    expect(text).not.toContain("Tip:");
    expect(text).not.toContain("Insight:");
    expect(text).not.toMatch(/outlier|median|MAD|threshold|findings/i);

    const insight = events.find(
      (event): event is Extract<AgentEvent, { type: "insight" }> => event.type === "insight"
    );
    expect(insight?.accountId).toBeUndefined();
  });

  it("explains a single duplicate and a single outlier without an account label", async () => {
    const { text } = await run("Anything weird?", async () =>
      ok({
        count: 2,
        duplicateCount: 1,
        outlierCount: 1,
        summary: "I found an unusually large purchase and a possible duplicate.",
        findings: [
          {
            type: "duplicate",
            description: "NETFLIX",
            amount: 15.99,
            date: "2026-10-02",
            duplicateOf: "2026-09-30"
          },
          {
            type: "outlier",
            description: "APPLE STORE",
            amount: 1200,
            date: "2026-10-12"
          }
        ]
      })
    );

    expect(text).toContain("I found an unusually large purchase and a possible duplicate.");
    expect(text).toContain("NETFLIX is a possible duplicate.");
    expect(text).toContain("APPLE STORE is an unusually large purchase.");
    expect(text).not.toContain("on your");
    expect(text).not.toContain("$15");
    expect(text).not.toContain("$1,200");
    expect(text).not.toContain("2026-10-02");
    expect(text).not.toContain("2026-09-30");
    expect(text).not.toContain("2026-10-12");
  });

  it("reports an empty anomaly result without a dispute next step", async () => {
    const { text } = await run("Anything weird?", async () => ok({ count: 0, findings: [] }));

    expect(text).toContain("Nothing unusual stood out across your accounts.");
    expect(text).not.toContain("review and dispute");
    expect(text).not.toContain("Tip:");
    expect(text).not.toContain("Insight:");
  });

  it("degrades gracefully when a tool fails", async () => {
    const { events, text } = await run("Anything weird?", async () => {
      throw new Error("MCP unavailable");
    });

    const toolResult = events.find((event) => event.type === "tool_result");
    expect(toolResult).toMatchObject({ type: "tool_result", ok: false });
    expect(text).toContain("couldn't read that data");
    expect(events[events.length - 1]?.type).toBe("done");
  });

  it("explains Arlington-only demo ATM coverage for other cities", async () => {
    const { text } = await run("Find an ATM in Cambridge, Massachusetts", async (name) => {
      expect(name).toBe("find_nearby_atms");
      return ok({
        count: 13,
        resolvedLocation: {
          lat: 42.3656347,
          lng: -71.1040018,
          label: "Cambridge, Middlesex County, Massachusetts, United States"
        },
        coverage: "Arlington, VA",
        demoCoverage: true,
        results: [
          {
            name: "Arlington ATM",
            distanceMiles: 396,
            lat: 38.88,
            lng: -77.1
          }
        ]
      });
    });

    expect(text).toContain("demo ATM data only includes Arlington, VA");
    expect(text).toContain("Arlington ATM");
    expect(text).toContain('"Cambridge, Massachusetts"');
    expect(text).not.toContain('near "Cambridge');
    expect(text).not.toContain("near Cambridge");
    expect(text).not.toContain("closest option is");
    expect(text).toContain("Open the map on OpenStreetMap for directions.");
    expect(text).not.toContain("Tip:");
    expect(text).not.toContain("Insight:");
    expect(text).toContain("Here are the closest ATMs I found:");
  });

  it("uses the resolved Arlington label to keep the covered wording", async () => {
    const { text } = await run("Find an ATM near Arlington, VA", async (name) => {
      expect(name).toBe("find_nearby_atms");
      return ok({
        count: 2,
        resolvedLocation: {
          lat: 38.8809358,
          lng: -77.1079246,
          label: "Arlington, Arlington County, Virginia, United States"
        },
        coverage: "Arlington, VA",
        demoCoverage: true,
        results: [
          { name: "Clarendon ATM", distanceMiles: 0.1, lat: 38.88, lng: -77.1 }
        ]
      });
    });

    expect(text).toContain('I found 2 ATMs near "Arlington, VA"');
    expect(text).not.toContain("demo ATM data only includes Arlington");
    expect(text).toContain("Open the map on OpenStreetMap for directions.");
    expect(text).not.toContain("Tip:");
    expect(text).not.toContain("Insight:");
  });

  it("mentions Arlington-only coverage when no ATMs are returned", async () => {
    const { text } = await run("Find an ATM in Cambridge, MA", async (name) => {
      expect(name).toBe("find_nearby_atms");
      return ok({
        count: 0,
        message: 'No ATMs found matching "Cambridge, MA".',
        coverage: "Arlington, VA",
        demoCoverage: true
      });
    });

    expect(text).toContain("couldn't find any ATMs");
    expect(text).toContain("demo ATM data only includes Arlington, VA");
    expect(text).toContain("Open the map on OpenStreetMap for directions.");
    expect(text).not.toContain("Tip:");
    expect(text).not.toContain("Insight:");
  });

  it("treats a distant nearest result as outside demo coverage when unresolved", async () => {
    const { text } = await run("Find an ATM in Cambridge, MA", async (name) => {
      expect(name).toBe("find_nearby_atms");
      return ok({
        count: 13,
        results: [{ name: "Arlington ATM", distanceMiles: 396, lat: 38.88, lng: -77.1 }]
      });
    });

    expect(text).toContain("demo ATM data only includes Arlington, VA");
    expect(text).not.toContain('near "Cambridge');
  });

  it("keeps the near wording when the nearest ATM is inside the radius", async () => {
    const { text } = await run("Find an ATM near Arlington", async (name) => {
      expect(name).toBe("find_nearby_atms");
      return ok({
        count: 2,
        results: [
          { name: "Clarendon ATM", distanceMiles: 5, lat: 38.88, lng: -77.1 },
          { name: "Courthouse ATM", distanceMiles: 7, lat: 38.89, lng: -77.08 }
        ]
      });
    });

    expect(text).toContain("I found 2 ATMs near");
    expect(text).not.toContain("couldn't find any ATMs");
    expect(text).not.toContain("within 25 miles of");
    expect(text).toContain("Open the map on OpenStreetMap for directions.");
    expect(text).not.toContain("Tip:");
    expect(text).not.toContain("Insight:");
  });

  it("passes in/around/at locations through to the ATM and branch tools", () => {
    const session = createSession(customer, accounts);
    const atmCases: Array<[string, string]> = [
      ["Find ATMs in Cambridge, Massachusetts", "Cambridge, Massachusetts"],
      ["ATMs around Cambridge", "Cambridge"],
      ["Find an ATM near Arlington", "Arlington"],
      ["Find an ATM at Ballston Common Mall", "Ballston Common Mall"],
      ["Find an ATM within Boston", "Boston"],
      ["Find an ATM close to Dupont Circle.", "Dupont Circle"]
    ];
    for (const [message, location] of atmCases) {
      const route = routeIntent(message);
      expect(route.tool, message).toBe("find_nearby_atms");
      expect(route.args(session), message).toEqual({ location });
    }

    expect(routeIntent("Find an ATM").args(session)).toEqual({ location: "Arlington" });
    expect(routeIntent("Find a branch in Arlington").args(session)).toEqual({
      location: "Arlington"
    });
    expect(routeIntent("Find a branch near Ballston").args(session)).toEqual({
      location: "Ballston"
    });
  });

  it("reports the requested 'in Cambridge' location instead of silently using the default", async () => {
    const { text } = await run("Find ATMs in Cambridge, Massachusetts", async (name) => {
      expect(name).toBe("find_nearby_atms");
      return ok({
        count: 13,
        results: [{ name: "Arlington ATM", distanceMiles: 396, lat: 38.88, lng: -77.1 }]
      });
    });

    expect(text).toContain('"Cambridge, Massachusetts"');
    expect(text).not.toContain('near "Cambridge');
    expect(text).toContain("demo ATM data only includes Arlington, VA");
    expect(text).not.toContain("within 25 miles");
  });

  it("composes friendly intros that avoid card tokens", () => {
    expect(composeIntro("insight_spending_breakdown")).toBe(
      "Here is your top spending by category:"
    );
    expect(composeIntro("insight_upcoming_bills")).toBe("Here is what's coming up:");
    expect(composeIntro("insight_anomalies")).toBe("Here is what stood out:");
    expect(composeIntro("find_nearby_atms")).toBe("Here are the closest ATMs I found:");
    expect(composeIntro("find_nearby_branches")).toBe("Here is what's nearby:");
    expect(composeIntro("nessie_list_account_loans")).toBe("Here is what I found:");
    expect(composeIntro("nessie_list_account_loans").toLowerCase()).not.toContain("loan");
  });

  it("routes topic questions to the grounded tool for that topic", () => {
    expect(routeIntent("Show me my loans").tool).toBe("nessie_list_account_loans");
    expect(routeIntent("Show me my recent transactions").tool).toBe(
      "nessie_list_account_withdrawals"
    );
    expect(routeIntent("Show me my recurring payments").tool).toBe("insight_recurring_charges");
    expect(routeIntent("Show me my credit card rewards").tool).toBe(
      "nessie_list_customer_accounts"
    );
    expect(routeIntent("Anything weird in my transactions?").tool).toBe("insight_anomalies");
    expect(routeIntent("Any suspicious transactions?").tool).toBe("insight_anomalies");
    expect(routeIntent("Are there any unusual purchases?").tool).toBe("insight_anomalies");
    expect(routeIntent("Anything strange?").tool).toBe("insight_anomalies");
    expect(routeIntent("Any odd charges?").tool).toBe("insight_anomalies");
    expect(routeIntent("Did I get double charged?").tool).toBe("insight_anomalies");
  });

  it("scans all accounts for broad anomaly questions and one account for named ones", () => {
    const session = createSession(customer, [
      {
        id: "checking-id",
        type: "Checking",
        nickname: "Everyday Checking",
        balance: 4218,
        rewards: 0,
        accountNumber: "****1234"
      },
      {
        id: "savings-id",
        type: "Savings",
        nickname: "Rainy Day",
        balance: 12000,
        rewards: 0,
        accountNumber: "****5678"
      },
      {
        id: "card-id",
        type: "Credit Card",
        nickname: "Venture",
        balance: -450,
        rewards: 1200,
        accountNumber: "****9012"
      }
    ]);

    expect(routeIntent("Anything weird in my transactions?").args(session)).toEqual({
      customerId: "cust-1"
    });
    expect(routeIntent("Any suspicious credit card charges?").args(session)).toEqual({
      customerId: "cust-1",
      accountId: "card-id"
    });
    expect(routeIntent("Suspicious checking transactions?").args(session)).toEqual({
      customerId: "cust-1",
      accountId: "checking-id"
    });
    expect(routeIntent("Anything odd on my Rainy Day account?").args(session)).toEqual({
      customerId: "cust-1",
      accountId: "savings-id"
    });
  });

  it("routes ranked category and merchant purchase questions to top transactions", () => {
    const session = createSession(customer, accounts);
    const grocery = routeIntent("What are my biggest grocery expenses");
    expect(grocery.tool).toBe("insight_top_transactions");
    expect(grocery.args(session)).toEqual({
      accountId: "acct-1",
      category: "groceries",
      months: 3,
      limit: 20
    });

    const housing = routeIntent("What are my highest housing purchases");
    expect(housing.tool).toBe("insight_top_transactions");
    expect(housing.args(session)).toEqual({
      accountId: "acct-1",
      category: "housing",
      months: 3,
      limit: 20
    });

    const ranked = routeIntent("Show me my biggest purchases");
    expect(ranked.tool).toBe("insight_top_transactions");
    expect(ranked.args(session)).toEqual({ accountId: "acct-1", months: 3, limit: 20 });

    expect(routeIntent("Show me my recent transactions").tool).toBe(
      "nessie_list_account_withdrawals"
    );
  });

  it("composes a recurring-charges answer instead of an empty overview", () => {
    const text = composeFastAnswer(
      "insight_recurring_charges",
      {
        count: 3,
        recurringCharges: [
          { description: "NETFLIX.COM", monthsSeen: 3, averageAmount: 15, lastDate: "2026-11-01" }
        ]
      },
      new Date("2026-11-14T12:00:00Z"),
      "What subscriptions am I paying for?"
    );
    expect(text).toContain("I found 3 recurring charges");
    expect(text).not.toContain("Across 0 accounts");
    expect(text).toContain("You can review subscriptions you no longer use in the app.");
  });

  it("composes a top-transactions answer without restating card values", async () => {
    const payload = {
      count: 2,
      total: 180,
      category: "groceries",
      merchant: null,
      months: 3,
      items: [
        { _id: "t-1", description: "TRADER JOE'S", amount: 100, transactionDate: "2026-10-05" },
        { _id: "t-2", description: "LOCAL FARMERS MARKET", amount: 80, transactionDate: "2026-11-01" }
      ]
    };
    const { text } = await run("What are my biggest grocery expenses", async (name) => {
      expect(name).toBe("insight_top_transactions");
      return ok(payload);
    });

    expect(text).toContain("I found 2 grocery transactions in the last 3 months");
    expect(text).toContain("Open any transaction to see its full details.");
    expect(text).not.toContain("TRADER JOE");
    expect(text).not.toContain("100");
    expect(text).not.toContain("2026-10-05");
    expect(text).not.toContain("Tip:");
    expect(text).not.toContain("Insight:");
  });

  it("composes an empty top-transactions answer", () => {
    const text = composeFastAnswer(
      "insight_top_transactions",
      { count: 0, total: 0, category: "housing", merchant: null, months: 3, items: [] },
      new Date("2026-11-14T12:00:00Z"),
      "What are my highest housing purchases"
    );
    expect(text).toContain(
      "I couldn't find any housing transactions in the last 3 months."
    );
    expect(text).toContain("Open any transaction to see its full details.");
  });

  it("compares loans without restating balances or payments", async () => {
    const { text } = await run("Show me my loans", async (name) => {
      expect(name).toBe("nessie_list_account_loans");
      return ok({
        count: 2,
        items: [
          { type: "Auto Loan", amount: 18500, monthlyPayment: 412 },
          { type: "Student Loan", amount: 12400, monthlyPayment: 180 }
        ]
      });
    });

    expect(text).toContain("You have 2 loans: Auto Loan and Student Loan.");
    expect(text).toContain("The Auto Loan has the larger balance and monthly payment.");
    expect(text).toContain("Together they make up a fixed monthly obligation.");
    expect(text).toContain("Open the loan details to see the payment schedule.");
    expect(text).not.toContain("$18,500");
    expect(text).not.toContain("$12,400");
    expect(text).not.toContain("$30,900");
    expect(text).not.toContain("$412");
    expect(text).not.toContain("$180");
    expect(text).not.toContain("$592");
    expect(text).not.toContain("Tip:");
    expect(text).not.toContain("Insight:");
    expect(text).not.toMatch(/No loans/i);
  });

  it("handles a single loan without quoting its balance", () => {
    const text = composeFastAnswer(
      "nessie_list_account_loans",
      { count: 1, items: [{ type: "Auto Loan", amount: 18500, monthlyPayment: 412 }] },
      new Date("2026-11-14T12:00:00Z"),
      "Show me my loans"
    );
    expect(text).toContain("You have one active loan, the Auto Loan.");
    expect(text).toContain("It’s your only fixed loan payment.");
    expect(text).not.toContain("$18,500");
    expect(text).not.toContain("$412");
    expect(text).toContain("Open the loan details to see the payment schedule.");
  });

  it("compares a loan that wins only one of balance or payment", () => {
    const text = composeFastAnswer(
      "nessie_list_account_loans",
      {
        count: 2,
        items: [
          { type: "Auto Loan", amount: 18500, monthlyPayment: 180 },
          { type: "Student Loan", amount: 12400, monthlyPayment: 412 }
        ]
      },
      new Date("2026-11-14T12:00:00Z"),
      "Show me my loans"
    );
    expect(text).toContain(
      "The Auto Loan has the larger balance, while the Student Loan has the larger monthly payment."
    );
    expect(text).not.toContain("$18,500");
    expect(text).not.toContain("$412");
  });

  it("routes where-you-shop questions to the top merchants tool", () => {
    const session = createSession(customer, accounts);
    const intent = routeIntent("Where do I shop most?");
    expect(intent.tool).toBe("insight_top_merchants");
    expect(intent.args(session)).toEqual({ accountId: "acct-1", months: 3, limit: 5 });
  });

  it("names the top merchant without restating pie or list data", async () => {
    const { text } = await run("Where do I shop most?", async (name) => {
      expect(name).toBe("insight_top_merchants");
      return ok({
        count: 12,
        months: 3,
        items: [
          {
            _id: "merchant:whole-foods-market",
            name: "Whole Foods Market",
            category: "groceries",
            transactionCount: 9,
            total: 540
          }
        ]
      });
    });

    expect(text).toContain("Here is where you shop most:");
    expect(text).toContain("Your most frequent merchant is Whole Foods Market");
    expect(text).toContain("more visits than any other merchant in the last 3 months");
    expect(text).toContain("You can review merchant activity in the app.");
    expect(text).not.toContain("$540");
    expect(text).not.toContain("Tip:");
    expect(text).not.toContain("Insight:");
  });

  it("composes an empty top-merchants answer", () => {
    const text = composeFastAnswer(
      "insight_top_merchants",
      { count: 0, months: 3, items: [] },
      new Date("2026-11-14T12:00:00Z"),
      "Where do I shop most?"
    );
    expect(text).toContain(
      "I couldn’t find any merchant activity in the last three months."
    );
    expect(text).toContain("You can review merchant activity in the app.");
  });

  it("routes ClimateWise questions to the climatewise insight tool", () => {
    const session = createSession(customer, accounts);
    for (const message of [
      "What's my ClimateWise score?",
      "How can I lower my emissions?",
      "What is my carbon footprint?",
      "Tell me about my LORAX score",
      "How much CO2 do I produce?"
    ]) {
      const route = routeIntent(message);
      expect(route.tool, message).toBe("insight_climatewise");
      expect(route.args(session), message).toEqual({ customerId: "cust-1", days: 90 });
    }
  });

  it("adds climate interpretation and a nudge without restating card values", async () => {
    const { events, text } = await run("What's my ClimateWise score?", async (name, args) => {
      expect(name).toBe("insight_climatewise");
      expect(args).toEqual({ customerId: "cust-1", days: 90 });
      return ok(climatePayload);
    });

    expect(text).toContain("Here’s what goes into your LORAXⓇ Score:");
    expect(text).toContain("small habit changes can bring it down");
    expect(text).toContain("swap two drives a week for the T or a bike");
    expect(text).toContain("You can open the full report for a breakdown of your emissions.");
    expect(text).not.toContain("Travel & transport");
    expect(text).not.toContain("biggest driver");
    expect(text).not.toContain("712");
    expect(text).not.toContain("412.35");
    expect(text).not.toContain("Good");
    expect(text).not.toContain("90 days");
    expect(text).not.toContain("kg");
    expect(text).not.toContain("Tip:");
    expect(text).not.toContain("Insight:");

    const insight = events.find(
      (event): event is Extract<AgentEvent, { type: "insight" }> => event.type === "insight"
    );
    expect(insight?.kind).toBe("insight_climatewise");
  });

  it("gives an honest no-data climate answer", () => {
    const text = composeFastAnswer(
      "insight_climatewise",
      { ...climatePayload, purchaseCount: 0, totalKg: 0, categories: [] },
      new Date("2026-11-14T12:00:00Z"),
      "What's my ClimateWise score?"
    );
    expect(text).toContain(
      "I don't see enough purchase data in this window to estimate your carbon footprint yet."
    );
    expect(text).not.toContain("biggest driver");
    expect(text).not.toContain("Tip:");
    expect(text).not.toContain("Insight:");
  });

  it("uses a friendly ClimateWise intro", () => {
    expect(composeIntro("insight_climatewise")).toBe("Here’s what goes into your LORAXⓇ Score:");
  });
});
