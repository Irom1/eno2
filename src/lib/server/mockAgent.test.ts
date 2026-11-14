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

  it("uses the latest complete month for spending answers", async () => {
    const { text } = await run("Where did my money go?", async (name) => {
      expect(name).toBe("insight_spending_breakdown");
      return ok(spendingPayload);
    });

    expect(text).toContain("October 2026");
    expect(text).toContain("$2,470");
    expect(text).toContain("shopping");
    expect(text).toContain("$1,800");
    expect(text).toContain("20 transactions");
    const nextStep = "You can open a category in Activity to see the transactions behind it.";
    expect(text).toContain(nextStep);
    expect(text).not.toContain("Tip:");
    expect(text).not.toContain("Insight:");
    const advice = text.slice(text.indexOf(nextStep));
    expect(advice).not.toContain("$2,470");
    expect(advice).not.toContain("$1,800");
    expect(text).not.toContain("estimated");
    expect(text).not.toContain("descriptions");
    expect(text).not.toContain("November 2026");
  });

  it("describes anomalies in plain language", async () => {
    const { events, text } = await run("Anything weird in my transactions?", async (name) => {
      expect(name).toBe("insight_anomalies");
      return ok({
        count: 2,
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
      });
    });

    expect(text).toContain("possible duplicate");
    expect(text).toContain("unusually large purchase");
    const nextStep = "If you don’t recognize a charge, you can review and dispute it in the app.";
    expect(text).toContain(nextStep);
    expect(text).not.toContain("Tip:");
    expect(text).not.toContain("Insight:");
    const advice = text.slice(text.indexOf(nextStep));
    expect(advice).not.toContain("15.99");
    expect(advice).not.toContain("1,200");
    expect(text).not.toMatch(/outlier|median|MAD|threshold|findings/i);

    const insight = events.find(
      (event): event is Extract<AgentEvent, { type: "insight" }> => event.type === "insight"
    );
    expect(insight?.accountId).toBe("acct-1");
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
  });

  it("composes a loans answer from live loan rows", async () => {
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

    expect(text).toContain("Auto Loan");
    expect(text).toContain("Student Loan");
    expect(text).toContain("$30,900");
    expect(text).toContain("$592");
    expect(text).not.toMatch(/No loans/i);
  });
});
