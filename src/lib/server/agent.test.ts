import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDeps, RoundResult } from "./agent";
import { resetGeminiBreaker, runGeminiAgent } from "./agent";
import type { AgentEvent } from "./events";
import type { McpSession, ToolCallResult } from "./mcp";
import type { RuntimeEnv } from "./env";
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
  count: 8,
  total: 4283.59,
  checkingBalance: 4218,
  shortfall: 65.59,
  liquidBalance: 16858,
  bills: [
    {
      billId: "bill-1",
      payee: "MIT Bursar",
      nickname: "Tuition installment",
      amount: 1800,
      dueDate: "2026-12-05",
      daysUntil: 21,
      status: "pending",
      accountId: "acct-1"
    }
  ]
};

const runtime: RuntimeEnv = {
  NESSIE_API_KEY: "test-nessie",
  NESSIE_BASE_URL: "https://prod-api.nessieisreal.com",
  GEMINI_API_KEY: "test-gemini",
  GEMINI_MODEL: "gemini-3.8-flash",
  LLM: "gemini"
};

// Fake deps fully override the provider/tool bridges, so the MCP session is
// only a structural placeholder.
const mcp = {
  client: null as unknown as McpSession["client"],
  tools: [],
  close: async () => undefined
} satisfies McpSession;

const toolResult: ToolCallResult = {
  ok: true,
  data: billsPayload,
  text: JSON.stringify(billsPayload)
};

function baseDeps(overrides: Partial<AgentDeps>): AgentDeps {
  return {
    stream: async () => ({ text: "", parts: [], functionCalls: [] }),
    generateOnce: async () => ({ text: "", parts: [], functionCalls: [] }),
    callTool: async () => toolResult,
    getDeclarations: async () => [],
    isConfigured: () => true,
    now: () => Date.now(),
    ...overrides
  };
}

function capture(session = createSession(customer, accounts)) {
  const events: AgentEvent[] = [];
  const emit = (event: AgentEvent) => events.push(event);
  return { session, events, emit };
}

describe("agent loop", () => {
  beforeEach(() => {
    resetGeminiBreaker();
  });

  it("executes a tool round, feeds the result back, and finishes", async () => {
    let streamCalls = 0;
    const { session, events, emit } = capture();

    const rounds: RoundResult[] = [
      {
        text: "",
        parts: [
          { functionCall: { name: "insight_upcoming_bills", args: { customerId: "cust-1" } }, thoughtSignature: "sig-1" }
        ],
        functionCalls: [{ name: "insight_upcoming_bills", args: { customerId: "cust-1" } }],
        usage: { promptTokenCount: 10, candidatesTokenCount: 2 }
      },
      {
        text: "You have 8 bills totaling $4,283.59.",
        parts: [{ text: "You have 8 bills totaling $4,283.59." }],
        functionCalls: [],
        usage: { promptTokenCount: 20, candidatesTokenCount: 9 }
      }
    ];

    const callTool = vi.fn(async () => toolResult);
    await runGeminiAgent({
      session,
      message: "What's due?",
      emit,
      runtime,
      mcp,
      deps: baseDeps({
        stream: async (params) => {
          const round = rounds[streamCalls++] as RoundResult;
          if (round.text) params.onText(round.text);
          return round;
        },
        callTool,
        now: () => 1_000_000
      })
    });

    expect(callTool).toHaveBeenCalledWith("insight_upcoming_bills", { customerId: "cust-1" });
    const types = events.map((event) => event.type);
    expect(types).toEqual([
      "tool_start",
      "tool_result",
      "insight",
      "text",
      "text",
      "usage",
      "done"
    ]);

    const text = events
      .filter((event): event is Extract<AgentEvent, { type: "text" }> => event.type === "text")
      .map((event) => event.delta)
      .join("");
    expect(text).toContain("8 bills");
    expect(events.find((event) => event.type === "usage")).toMatchObject({
      promptTokens: 10,
      outputTokens: 2,
      rounds: 1
    });

    // Thought signature is preserved verbatim across turns.
    const modelTurn = session.contents.find((content) => content.role === "model");
    expect(modelTurn?.parts[0]?.thoughtSignature).toBe("sig-1");
  });

  it("forces insight_anomalies to the routed account scope", async () => {
    const { session, events, emit } = capture();
    const callTool = vi.fn(async () => ({
      ok: true,
      data: {
        count: 0,
        duplicateCount: 0,
        outlierCount: 0,
        summary: "Nothing unusual stood out.",
        findings: []
      },
      text: JSON.stringify({ count: 0, findings: [] })
    }));

    await runGeminiAgent({
      session,
      message: "Any suspicious transactions?",
      emit,
      runtime,
      mcp,
      deps: baseDeps({
        stream: async () => ({
          text: "",
          parts: [
            {
              functionCall: {
                name: "insight_anomalies",
                args: { accountId: "checking-id" }
              },
              thoughtSignature: "sig-anomaly"
            }
          ],
          functionCalls: [
            { name: "insight_anomalies", args: { accountId: "checking-id" } }
          ]
        }),
        callTool,
        now: () => 1_000_000
      })
    });

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith("insight_anomalies", { customerId: "cust-1" });
    const text = events
      .filter((event): event is Extract<AgentEvent, { type: "text" }> => event.type === "text")
      .map((event) => event.delta)
      .join("");
    expect(text).toContain("Nothing unusual stood out across your accounts.");
  });

  it('keeps a referenced transaction scoped and lets the model answer the follow-up', async () => {
    const { session, events, emit } = capture();
    session.contents = [
      { role: 'model', parts: [{ functionCall: { name: 'insight_top_transactions', args: { accountId: 'acct-1' } } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'insight_top_transactions', response: { result: { items: [
        { _id: 'coffee-159', description: 'LOCAL COFFEE', amount: 159 }, { _id: 'coffee-10', description: 'LOCAL COFFEE', amount: 10 }
      ] } } } }] }
    ];
    let rounds = 0;
    const callTool = vi.fn(async () => ({ ok: true, text: '{}', data: { count: 1, findings: [{ _id: 'coffee-159' }], assessment: { found: true } } }));
    await runGeminiAgent({ session, message: 'is that first one suspicious', emit, runtime, mcp, deps: baseDeps({
      callTool,
      stream: async (params) => {
        if (rounds++ === 0) return { text: '', parts: [{ functionCall: { name: 'insight_anomalies', args: { customerId: 'cust-1' } } }], functionCalls: [{ name: 'insight_anomalies', args: { customerId: 'cust-1' } }] };
        const text = 'That LOCAL COFFEE charge is unusually large compared with your normal visits. That does not establish fraud.';
        params.onText(text);
        return { text, parts: [{ text }], functionCalls: [] };
      }
    }) });
    expect(rounds).toBe(2);
    expect(callTool).toHaveBeenCalledWith('insight_anomalies', { customerId: 'cust-1', accountId: 'acct-1', transactionId: 'coffee-159' });
    const text = events.filter((event) => event.type === 'text').map((event) => event.delta).join('');
    expect(text).toContain('That LOCAL COFFEE charge');
    expect(text).not.toContain('Here is what stood out');
  });

  it.each(['why didnt you include it when i asked for suspicious transactions', 'i asked why not show me'])('does not replace an explanation with a canned scan or snapshot: %s', async (message) => {
    const { session, events, emit } = capture();
    let rounds = 0;
    await runGeminiAgent({ session, message, emit, runtime, mcp, deps: baseDeps({
      stream: async (params) => {
        if (rounds++ === 0) return { text: '', parts: [{ functionCall: { name: 'insight_anomalies', args: { accountId: 'acct-1' } } }], functionCalls: [{ name: 'insight_anomalies', args: { accountId: 'acct-1' } }] };
        const text = 'You asked why it was omitted. I cannot establish the reason from the saved results alone.';
        params.onText(text);
        return { text, parts: [{ text }], functionCalls: [] };
      }, callTool: async () => ({ ok: true, data: { findings: [] }, text: '{}' })
    }) });
    expect(rounds).toBe(2);
    const text = events.filter((event) => event.type === 'text').map((event) => event.delta).join('');
    expect(text).toContain('You asked why');
    expect(text).not.toContain('financial snapshot');
  });

  it("emits an insight event for a raw nessie tool payload", async () => {
    let streamCalls = 0;
    const { session, events, emit } = capture();
    const loansPayload = {
      count: 1,
      truncated: false,
      items: [
        {
          _id: "loan-1",
          type: "Auto",
          status: "active",
          monthlyPayment: 412,
          amount: 18400,
          creditScore: 721
        }
      ]
    };

    const rounds: RoundResult[] = [
      {
        text: "",
        parts: [
          {
            functionCall: { name: "nessie_list_account_loans", args: { accountId: "acct-1" } },
            thoughtSignature: "sig-loan"
          }
        ],
        functionCalls: [{ name: "nessie_list_account_loans", args: { accountId: "acct-1" } }]
      },
      {
        text: "You have one auto loan.",
        parts: [{ text: "You have one auto loan." }],
        functionCalls: []
      }
    ];

    const callTool = vi.fn(async () => ({
      ok: true,
      data: loansPayload,
      text: JSON.stringify(loansPayload)
    }));

    await runGeminiAgent({
      session,
      message: "Show me my loans",
      emit,
      runtime,
      mcp,
      deps: baseDeps({
        stream: async (params) => {
          const round = rounds[streamCalls++] as RoundResult;
          if (round.text) params.onText(round.text);
          return round;
        },
        callTool,
        now: () => 1_000_000
      })
    });

    const insight = events.find(
      (event): event is Extract<AgentEvent, { type: "insight" }> => event.type === "insight"
    );
    expect(insight).toMatchObject({
      type: "insight",
      kind: "nessie_list_account_loans",
      payload: loansPayload
    });
    expect(events.map((event) => event.type)).toEqual([
      "tool_start",
      "tool_result",
      "insight",
      "text",
      "text",
      "usage",
      "done"
    ]);
    expect(events[events.length - 1]?.type).toBe("done");
  });

  it("rejects a tool call outside the session allowlist without calling MCP", async () => {
    let streamCalls = 0;
    const { session, events, emit } = capture();
    const callTool = vi.fn(async () => toolResult);

    const rounds: RoundResult[] = [
      {
        text: "",
        parts: [{ functionCall: { name: "insight_spending_breakdown", args: { accountId: "acct-foreign" } } }],
        functionCalls: [{ name: "insight_spending_breakdown", args: { accountId: "acct-foreign" } }]
      },
      { text: "I couldn't access that account.", parts: [{ text: "I couldn't access that account." }], functionCalls: [] }
    ];

    await runGeminiAgent({
      session,
      message: "Show another account",
      emit,
      runtime,
      mcp,
      deps: baseDeps({ stream: async () => rounds[streamCalls++] as RoundResult, callTool })
    });

    expect(callTool).not.toHaveBeenCalled();
    const toolResultEvent = events.find((event) => event.type === "tool_result");
    expect(toolResultEvent).toMatchObject({ type: "tool_result", ok: false });
    expect(events[events.length - 1]?.type).toBe("done");
  });

  it("retries non-streaming when Gemini reports a thought-signature error", async () => {
    const { session, events, emit } = capture();
    const generateOnce = vi.fn(async () => ({
      text: "Here is the summary.",
      parts: [{ text: "Here is the summary." }],
      functionCalls: []
    }));

    await runGeminiAgent({
      session,
      message: "Snapshot please",
      emit,
      runtime,
      mcp,
      deps: baseDeps({
        stream: async () => {
          throw new Error("400 INVALID_ARGUMENT: missing thought signature");
        },
        generateOnce
      })
    });

    expect(generateOnce).toHaveBeenCalledTimes(1);
    const textEvents = events.filter((event) => event.type === "text");
    expect(textEvents).toHaveLength(1);
    expect(events[events.length - 1]?.type).toBe("done");
  });

  it("falls back to the deterministic agent when Gemini reports depleted credits", async () => {
    const { session, events, emit } = capture();
    const callTool = vi.fn(async () => toolResult);
    const stream = vi.fn(async () => {
      throw new Error(
        '402 {"error":{"code":402,"message":"Your prepayment credits are depleted. Visit AI Studio to manage billing."}}'
      );
    });

    await runGeminiAgent({
      session,
      message: "What's due before my next paycheck?",
      emit,
      runtime,
      mcp,
      deps: baseDeps({ stream, callTool })
    });

    expect(stream).toHaveBeenCalledTimes(1);
    expect(events[0]).toMatchObject({
      type: "notice",
      provider: "gemini",
      reason: "credits"
    });
    expect((events[0] as Extract<AgentEvent, { type: "notice" }>).message).toContain("credits are depleted");

    const types = events.map((event) => event.type);
    expect(types).toContain("tool_start");
    expect(types).toContain("tool_result");
    expect(types).toContain("insight");
    expect(types).not.toContain("error");
    expect(types[types.length - 1]).toBe("done");

    const text = events
      .filter((event): event is Extract<AgentEvent, { type: "text" }> => event.type === "text")
      .map((event) => event.delta)
      .join("");
    expect(text).toContain("4,283.59");
    expect(callTool).toHaveBeenCalledWith("insight_upcoming_bills", {
      customerId: "cust-1",
      days: 30
    });
  });

  it("reuses identical tool calls within one user turn", async () => {
    let streamCalls = 0;
    const { session, events, emit } = capture();
    const callTool = vi.fn(async () => toolResult);
    const args = { accountId: "acct-1", months: 3 };

    const rounds: RoundResult[] = [
      {
        text: "",
        parts: [
          { functionCall: { name: "insight_spending_breakdown", args } },
          { functionCall: { name: "insight_spending_breakdown", args } }
        ],
        functionCalls: [
          { name: "insight_spending_breakdown", args },
          { name: "insight_spending_breakdown", args }
        ]
      },
      {
        text: "You spent $2,470 in October.",
        parts: [{ text: "You spent $2,470 in October." }],
        functionCalls: []
      }
    ];

    await runGeminiAgent({
      session,
      message: "Where did my money go last month?",
      emit,
      runtime,
      mcp,
      deps: baseDeps({
        stream: async () => rounds[streamCalls++] as RoundResult,
        callTool
      })
    });

    expect(callTool).toHaveBeenCalledTimes(1);
    const toolResults = events.filter(
      (event): event is Extract<AgentEvent, { type: "tool_result" }> =>
        event.type === "tool_result"
    );
    expect(toolResults).toHaveLength(2);
    expect(toolResults[0]?.summary).not.toContain("(reused)");
    expect(toolResults[1]?.summary).toContain("(reused)");
    expect(events.filter((event) => event.type === "insight")).toHaveLength(1);
    const insight = events.find(
      (event): event is Extract<AgentEvent, { type: "insight" }> => event.type === "insight"
    );
    expect(insight?.accountId).toBe("acct-1");
    expect(events[events.length - 1]?.type).toBe("done");
  });

  it("skips Gemini while the circuit breaker is open", async () => {
    const { session, events, emit } = capture();
    const callTool = vi.fn(async () => toolResult);
    const stream = vi.fn(async () => {
      throw new Error("502 provider unavailable");
    });
    const deps = baseDeps({ stream, callTool });

    await runGeminiAgent({ session, message: "What's due?", emit, runtime, mcp, deps });
    expect(stream).toHaveBeenCalledTimes(1);

    await runGeminiAgent({ session, message: "What's due again?", emit, runtime, mcp, deps });
    expect(stream).toHaveBeenCalledTimes(1);
    expect(events.filter((event) => event.type === "notice")).toHaveLength(1);
    expect(events[events.length - 1]?.type).toBe("done");
  });

  it("emits a normalized card event for present_card without calling MCP", async () => {
    let streamCalls = 0;
    const { session, events, emit } = capture();
    const loansPayload = {
      count: 1,
      items: [
        {
          _id: "loan-1",
          type: "Auto",
          monthlyPayment: 412,
          amount: 18400,
          accountId: "acct-1"
        }
      ]
    };
    const callTool = vi.fn(async () => ({
      ok: true,
      data: loansPayload,
      text: JSON.stringify(loansPayload)
    }));

    const rounds: RoundResult[] = [
      {
        text: "Here is your loan.",
        parts: [
          { text: "Here is your loan." },
          {
            functionCall: { name: "nessie_list_account_loans", args: { accountId: "acct-1" } },
            thoughtSignature: "sig-loan"
          }
        ],
        functionCalls: [{ name: "nessie_list_account_loans", args: { accountId: "acct-1" } }]
      },
      {
        text: "",
        parts: [{ functionCall: { name: "present_card", args: { kind: "loan", id: "loan-1" } } }],
        functionCalls: [{ name: "present_card", args: { kind: "loan", id: "loan-1" } }]
      },
      {
        text: "You can review the payment schedule in the app.",
        parts: [{ text: "You can review the payment schedule in the app." }],
        functionCalls: []
      }
    ];

    await runGeminiAgent({
      session,
      message: "Show me my auto loan",
      emit,
      runtime,
      mcp,
      deps: baseDeps({
        stream: async (params) => {
          const round = rounds[streamCalls++] as RoundResult;
          if (round.text) params.onText(round.text);
          return round;
        },
        callTool
      })
    });

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith("nessie_list_account_loans", { accountId: "acct-1" });
    expect(callTool).not.toHaveBeenCalledWith("present_card", expect.anything());

    const cardEvents = events.filter(
      (event): event is Extract<AgentEvent, { type: "card" }> => event.type === "card"
    );
    expect(cardEvents).toHaveLength(1);
    expect(cardEvents[0]?.card).toMatchObject({
      kind: "loan",
      entityId: "loan:loan-1",
      afterText: "Here is your loan.".length,
      payload: {
        loanId: "loan-1",
        type: "Auto",
        balance: 18400,
        monthlyPayment: 412,
        accountId: "acct-1",
        customerId: "cust-1"
      }
    });

    const presentResults = events.filter(
      (event): event is Extract<AgentEvent, { type: "tool_result" }> =>
        event.type === "tool_result" && event.name === "present_card"
    );
    expect(presentResults).toHaveLength(1);
    expect(presentResults[0]).toMatchObject({ ok: true });
    expect(events[events.length - 1]?.type).toBe("done");
  });

  it("rejects present_card when the entity was not returned this turn", async () => {
    let streamCalls = 0;
    const { session, events, emit } = capture();
    const callTool = vi.fn(async () => toolResult);

    const rounds: RoundResult[] = [
      {
        text: "",
        parts: [{ functionCall: { name: "present_card", args: { kind: "loan", id: "loan-nope" } } }],
        functionCalls: [{ name: "present_card", args: { kind: "loan", id: "loan-nope" } }]
      },
      {
        text: "I couldn't find that loan to show.",
        parts: [{ text: "I couldn't find that loan to show." }],
        functionCalls: []
      }
    ];

    await runGeminiAgent({
      session,
      message: "Show me that loan",
      emit,
      runtime,
      mcp,
      deps: baseDeps({
        stream: async (params) => {
          const round = rounds[streamCalls++] as RoundResult;
          if (round.text) params.onText(round.text);
          return round;
        },
        callTool
      })
    });

    expect(callTool).not.toHaveBeenCalled();
    expect(events.filter((event) => event.type === "card")).toHaveLength(0);
    expect(
      events.find(
        (event) => event.type === "tool_result" && event.name === "present_card"
      )
    ).toMatchObject({ ok: false, summary: "Card not available" });
    expect(events.filter((event) => event.type === "text").length).toBeGreaterThan(0);
    expect(events[events.length - 1]?.type).toBe("done");
  });

  it("rejects present_card for an entity owned by another account", async () => {
    let streamCalls = 0;
    const { session, events, emit } = capture();
    const foreignLoans = {
      count: 1,
      items: [
        {
          _id: "loan-foreign",
          type: "Auto",
          monthlyPayment: 100,
          amount: 5000,
          accountId: "acct-foreign"
        }
      ]
    };
    const callTool = vi.fn(async () => ({
      ok: true,
      data: foreignLoans,
      text: JSON.stringify(foreignLoans)
    }));

    const rounds: RoundResult[] = [
      {
        text: "",
        parts: [
          {
            functionCall: {
              name: "nessie_list_account_loans",
              args: { accountId: "acct-1" }
            }
          }
        ],
        functionCalls: [
          { name: "nessie_list_account_loans", args: { accountId: "acct-1" } }
        ]
      },
      {
        text: "",
        parts: [
          {
            functionCall: {
              name: "present_card",
              args: { kind: "loan", id: "loan-foreign" }
            }
          }
        ],
        functionCalls: [
          { name: "present_card", args: { kind: "loan", id: "loan-foreign" } }
        ]
      },
      {
        text: "I can't show that loan.",
        parts: [{ text: "I can't show that loan." }],
        functionCalls: []
      }
    ];

    await runGeminiAgent({
      session,
      message: "What about the car payment?",
      emit,
      runtime,
      mcp,
      deps: baseDeps({
        stream: async (params) => {
          const round = rounds[streamCalls++] as RoundResult;
          if (round.text) params.onText(round.text);
          return round;
        },
        callTool
      })
    });

    expect(events.filter((event) => event.type === "card")).toHaveLength(0);
    expect(
      events.find(
        (event) => event.type === "tool_result" && event.name === "present_card"
      )
    ).toMatchObject({ ok: false });
    expect(events[events.length - 1]?.type).toBe("done");
  });
});
