import { describe, expect, it } from "vitest";
import {
  buildSpendingBreakdown,
  buildTopMerchants,
  buildTopTransactions,
  categorizeDescription,
  computeSavingsRate,
  detectDuplicateCharges,
  detectOutliers,
  filterUpcomingBills,
  findRecurringCharges,
  monthKey,
  normalizeSpendingCategory,
  projectGoal,
  toTransaction,
  type Transaction,
} from "./tools/insights";
import { daysBetween, parseDateUTC, toMoney, truncateText } from "./format";
import { maskAccountNumber } from "./client";

function tx(
  description: string,
  amount: number,
  date: string,
  kind: "deposit" | "withdrawal" = "withdrawal",
): Transaction {
  return { id: `${description}-${date}-${amount}`, description, amount, date: parseDateUTC(date), kind };
}

describe("date handling", () => {
  it("parses plain dates as UTC midnight and spans month boundaries", () => {
    expect(parseDateUTC("2026-10-31").toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(daysBetween("2026-10-31", "2026-11-01")).toBe(1);
  });

  it("is DST-safe around the US spring-forward date", () => {
    const before = parseDateUTC("2026-03-07");
    const after = parseDateUTC("2026-03-09");
    expect(daysBetween(before, after)).toBe(2);
    expect(daysBetween("2026-03-08", "2026-03-09")).toBe(1);
  });

  it("treats timestamps without a zone as UTC", () => {
    expect(parseDateUTC("2026-11-01T12:00:00").toISOString()).toBe(
      "2026-11-01T12:00:00.000Z",
    );
  });

  it("returns an invalid date for blank input without throwing", () => {
    expect(Number.isNaN(parseDateUTC(undefined).getTime())).toBe(true);
    expect(toTransaction({ description: "x", amount: 1 }, "withdrawal")).toBeNull();
  });
});

describe("month bucketing", () => {
  it("puts Oct 31 and Nov 1 in the correct monthly buckets", () => {
    const asOf = new Date(Date.UTC(2026, 10, 14));
    const breakdown = buildSpendingBreakdown(
      [tx("COFFEE", 5, "2026-10-31"), tx("GROCERY", 40, "2026-11-01")],
      2,
      asOf,
    );
    expect(breakdown.monthlyTotals).toEqual([
      { month: "2026-10", total: 5 },
      { month: "2026-11", total: 40 },
    ]);
  });

  it("compares the two most recent complete months for month-over-month", () => {
    const asOf = new Date(Date.UTC(2026, 11, 14));
    const breakdown = buildSpendingBreakdown(
      [tx("COFFEE", 5, "2026-10-31"), tx("GROCERY", 40, "2026-11-01")],
      3,
      asOf,
    );
    expect(breakdown.monthOverMonth).toEqual({
      from: "2026-10",
      to: "2026-11",
      delta: 35,
      pctChange: 700,
    });
  });

  it("excludes transactions before the window", () => {
    const asOf = new Date(Date.UTC(2026, 10, 14));
    const breakdown = buildSpendingBreakdown(
      [tx("OLD", 100, "2026-08-01"), tx("NEW", 10, "2026-10-01")],
      2,
      asOf,
    );
    expect(breakdown.totalSpend).toBe(10);
    expect(monthKey(parseDateUTC("2026-01-09"))).toBe("2026-01");
  });
});

describe("monthly breakdown", () => {
  const octoberTransactions = [
    tx("MONTHLY RENT", 1450, "2026-10-01"),
    tx("WHOLE FOODS MKT", 108, "2026-10-02"),
    tx("TRADER JOE", 100, "2026-10-03"),
    tx("SAFEWAY", 80, "2026-10-04"),
    tx("KROGER", 60, "2026-10-05"),
    tx("COSTCO", 60, "2026-10-06"),
    tx("ELECTRIC BILL", 100, "2026-10-07"),
    tx("COMCAST INTERNET", 50, "2026-10-08"),
    tx("VERIZON WIRELESS", 40, "2026-10-09"),
    tx("WATER UTILITY", 27, "2026-10-10"),
    tx("STARBUCKS", 30, "2026-10-11"),
    tx("CHIPOTLE", 27, "2026-10-12"),
    tx("CAFE", 25, "2026-10-13"),
    tx("PIZZA", 25, "2026-10-14"),
    tx("DELI", 20, "2026-10-15"),
    tx("GEICO INSURANCE", 96, "2026-10-16"),
    tx("UBER TRIP", 50, "2026-10-17"),
    tx("SHELL GAS STATION", 42, "2026-10-18"),
    tx("NETFLIX.COM", 41, "2026-10-19"),
    tx("PLANET FITNESS", 39, "2026-10-20"),
  ];

  it("breaks each month into categories with counts and shares", () => {
    const breakdown = buildSpendingBreakdown(
      octoberTransactions,
      3,
      new Date(Date.UTC(2026, 10, 14)),
    );
    const october = breakdown.monthlyBreakdown.find((month) => month.month === "2026-10");
    expect(october?.total).toBe(2470);
    expect(october?.transactionCount).toBe(20);

    const categories = new Map(
      (october?.categories ?? []).map((category) => [category.category, category.total]),
    );
    expect(categories.get("housing")).toBe(1450);
    expect(categories.get("groceries")).toBe(408);
    expect(categories.get("utilities")).toBe(217);
    expect(categories.get("dining")).toBe(127);
    expect(categories.get("insurance")).toBe(96);
    expect(categories.get("transport")).toBe(92);
    expect(categories.get("subscriptions")).toBe(41);
    expect(categories.get("fitness")).toBe(39);

    const categorySum = (october?.categories ?? []).reduce(
      (sum, category) => sum + category.total,
      0,
    );
    expect(toMoney(categorySum)).toBe(2470);
    expect(
      (october?.categories ?? []).every((category) => category.share >= 0),
    ).toBe(true);
  });

  it("reports empty months with zero totals and no categories", () => {
    const breakdown = buildSpendingBreakdown(
      octoberTransactions,
      3,
      new Date(Date.UTC(2026, 10, 14)),
    );
    const november = breakdown.monthlyBreakdown.find((month) => month.month === "2026-11");
    expect(november).toMatchObject({ total: 0, transactionCount: 0, categories: [] });
  });
});

describe("categorization", () => {
  it("maps known descriptions to categories", () => {
    expect(categorizeDescription("WHOLE FOODS MKT #123")).toBe("groceries");
    expect(categorizeDescription("NETFLIX.COM")).toBe("subscriptions");
    expect(categorizeDescription("UBER TRIP")).toBe("transport");
    expect(categorizeDescription("MYSTERY VENDOR")).toBe("other");
  });
});

describe("savings rate", () => {
  it("is zero when there is no inflow", () => {
    expect(computeSavingsRate(0, 500)).toBe(0);
    expect(computeSavingsRate(0, 0)).toBe(0);
  });

  it("is the retained fraction of inflow", () => {
    expect(computeSavingsRate(1000, 800)).toBe(0.2);
    expect(computeSavingsRate(1000, 1250)).toBe(-0.25);
  });
});

describe("duplicate detection", () => {
  it("flags the later NETFLIX charge within three days", () => {
    const findings = detectDuplicateCharges([
      tx("NETFLIX.COM", 15, "2026-10-05"),
      tx("NETFLIX.COM", 15, "2026-10-06"),
      tx("NETFLIX.COM", 15, "2026-10-20"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?._id).toBe("NETFLIX.COM-2026-10-06-15");
    expect(findings[0]?.duplicateOf).toBe("2026-10-05");
    expect(findings[0]?.date).toBe("2026-10-06");
    expect(findings[0]?.amount).toBe(15);
  });

  it("ignores same-description charges outside the window", () => {
    expect(
      detectDuplicateCharges([
        tx("NETFLIX.COM", 15, "2026-10-05"),
        tx("NETFLIX.COM", 15, "2026-10-09"),
      ]),
    ).toHaveLength(0);
  });
});

describe("outlier detection", () => {
  it("flags large gas and restaurant purchases even when those merchants recur across months", () => {
    const transactions = [
      tx('SHELL GAS STATION', 38, '2026-09-01'), tx('SHELL GAS STATION', 52, '2026-10-01'),
      tx('NEIGHBORHOOD RESTAURANT', 32, '2026-09-02'), tx('NEIGHBORHOOD RESTAURANT', 48, '2026-10-02'),
      tx('RENT', 1450, '2026-09-03'), tx('RENT', 1450, '2026-10-03'), tx('RENT', 1450, '2026-11-03'),
      tx('SHELL GAS STATION', 1800, '2026-11-04'), tx('NEIGHBORHOOD RESTAURANT', 1250, '2026-11-05')
    ];
    const findings = detectOutliers(transactions, new Date('2026-11-14T00:00:00Z'));
    expect(findings.map(({ description, amount }) => ({ description, amount }))).toEqual([
      { description: 'SHELL GAS STATION', amount: 1800 }, { description: 'NEIGHBORHOOD RESTAURANT', amount: 1250 }
    ]);
    expect(findings.every((finding) => finding.reason.includes('usual purchases'))).toBe(true);
    expect(findings.map((finding) => finding._id)).toEqual(transactions.slice(-2).map((item) => item.id));
  });

  it("detects merchant spikes when ordinary charges have no amount variation", () => {
    const transactions = Array.from({ length: 8 }, (_, index) => tx('GAS', 40, `2026-10-${String(index + 1).padStart(2, '0')}`));
    transactions.push(tx('GAS', 1800, '2026-10-20'));
    expect(detectOutliers(transactions, new Date('2026-11-14T00:00:00Z'))).toEqual([
      expect.objectContaining({ description: 'GAS', amount: 1800 })
    ]);
  });
  it("requires at least eight transactions", () => {
    const asOf = new Date(Date.UTC(2026, 10, 14));
    expect(
      detectOutliers([tx("BIG", 500, "2026-10-01"), tx("SMALL", 10, "2026-10-02")], asOf),
    ).toHaveLength(0);
  });

  it("uses median + 3*MAD", () => {
    const asOf = new Date(Date.UTC(2026, 10, 14));
    const amounts = [10, 12, 14, 16, 18, 20, 22, 24, 500];
    const transactions = amounts.map((amount, index) =>
      tx("PURCHASE", amount, `2026-10-${String(index + 1).padStart(2, "0")}`),
    );
    const findings = detectOutliers(transactions, asOf);
    expect(findings).toHaveLength(1);
    expect(findings[0]?._id).toBe("PURCHASE-2026-10-09-500");
    expect(findings[0]?.amount).toBe(500);
    expect(findings[0]?.threshold).toBe(30);
  });

  it("does not flag recurring monthly obligations", () => {
    const asOf = new Date(Date.UTC(2026, 10, 14));
    const transactions = [
      tx("BOSTON PROPERTIES RENT", 1450, "2026-09-01"),
      tx("BOSTON PROPERTIES RENT", 1450, "2026-10-01"),
      tx("BOSTON PROPERTIES RENT", 1450, "2026-11-01"),
      ...Array.from({ length: 8 }, (_, index) =>
        tx(`SHOP ${index}`, 10 + index * 2, `2026-10-${String(index + 1).padStart(2, "0")}`),
      ),
      tx("APPLE STORE", 899, "2026-11-07"),
    ];

    const findings = detectOutliers(transactions, asOf);
    expect(findings.map((finding) => finding.description)).toEqual(["APPLE STORE"]);
  });

  it("still treats repeated charges in the same month as candidates", () => {
    const asOf = new Date(Date.UTC(2026, 10, 14));
    const transactions = [
      ...Array.from({ length: 8 }, (_, index) =>
        tx(`SHOP ${index}`, 10 + index * 2, `2026-10-${String(index + 1).padStart(2, "0")}`),
      ),
      tx("BIG SAME MONTH", 500, "2026-10-20"),
      tx("BIG SAME MONTH", 500, "2026-10-21"),
    ];

    const findings = detectOutliers(transactions, asOf);
    expect(findings).toHaveLength(2);
    expect(findings.every((finding) => finding.description === "BIG SAME MONTH")).toBe(true);
  });
});

describe("upcoming bills", () => {
  it("drops past, cancelled, and far-future bills", () => {
    const asOf = new Date(Date.UTC(2026, 10, 14));
    const bills = [
      { _id: "past", payment_amount: 10, upcoming_payment_date: "2026-11-13", status: "pending" },
      { _id: "soon", payment_amount: 20, upcoming_payment_date: "2026-11-19", status: "pending" },
      { _id: "cancelled", payment_amount: 30, upcoming_payment_date: "2026-11-16", status: "cancelled" },
      { _id: "completed", payment_amount: 30, upcoming_payment_date: "2026-11-17", status: "completed" },
      { _id: "far", payment_amount: 40, upcoming_payment_date: "2026-12-30", status: "pending" },
    ];
    const result = filterUpcomingBills(bills, asOf, 30);
    expect(result.map((bill) => bill.billId)).toEqual(["soon"]);
    expect(result[0]?.daysUntil).toBe(5);
  });
});

describe("recurring charges", () => {
  it("requires at least two distinct months within 5%", () => {
    const charges = findRecurringCharges([
      tx("NETFLIX.COM", 15, "2026-09-05"),
      tx("NETFLIX.COM", 15, "2026-10-05"),
      tx("COFFEE SHOP", 4, "2026-10-01"),
      tx("COFFEE SHOP", 4, "2026-10-02"),
    ]);
    expect(charges).toHaveLength(1);
    expect(charges[0]?.description).toBe("NETFLIX.COM");
    expect(charges[0]?.monthsSeen).toBe(2);
    expect(charges[0]?.averageAmount).toBe(15);
  });
});

describe("top filtered transactions", () => {
  const asOf = new Date(Date.UTC(2026, 10, 14));

  it("normalizes category aliases", () => {
    expect(normalizeSpendingCategory("Grocery")).toBe("groceries");
    expect(normalizeSpendingCategory("rent")).toBe("housing");
    expect(normalizeSpendingCategory("  ")).toBe("");
    expect(normalizeSpendingCategory("groceries")).toBe("groceries");
  });

  it("classifies LOCAL FARMERS MARKET as groceries", () => {
    expect(categorizeDescription("LOCAL FARMERS MARKET")).toBe("groceries");
  });

  it("returns only matching category rows, largest first", () => {
    const result = buildTopTransactions(
      [
        tx("TRADER JOE'S", 100, "2026-10-05"),
        tx("LOCAL FARMERS MARKET", 80, "2026-11-01"),
        tx("EVERSOURCE", 220, "2026-11-02"),
        tx("RENT", 1800, "2026-10-01"),
      ],
      { category: "grocery", months: 3, asOf },
    );
    expect(result.category).toBe("groceries");
    expect(result.count).toBe(2);
    expect(result.total).toBe(180);
    expect(result.items.map((item) => item.description)).toEqual([
      "TRADER JOE'S",
      "LOCAL FARMERS MARKET",
    ]);
  });

  it("filters by merchant and respects the limit", () => {
    const result = buildTopTransactions(
      [
        tx("TRADER JOE'S", 100, "2026-10-05"),
        tx("TRADER JOE'S", 60, "2026-10-20"),
        tx("EVERSOURCE", 220, "2026-11-02"),
      ],
      { merchant: "trader joe", months: 3, limit: 1, asOf },
    );
    expect(result.merchant).toBe("trader joe");
    expect(result.count).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.amount).toBe(100);
  });

  it("excludes deposits and rows outside the month window", () => {
    const result = buildTopTransactions(
      [
        tx("PAYCHECK", 2000, "2026-11-01", "deposit"),
        tx("OLD STORE", 50, "2026-08-31"),
        tx("NEW STORE", 25, "2026-11-10"),
      ],
      { months: 3, asOf },
    );
    expect(result.count).toBe(1);
    expect(result.items[0]?.description).toBe("NEW STORE");
  });
});

describe("top merchants", () => {
  const asOf = new Date(Date.UTC(2026, 10, 14));

  it("groups by merchant and sorts by frequency then spend", () => {
    const result = buildTopMerchants(
      [
        tx("TRADER JOE'S", 100, "2026-10-05"),
        tx("TRADER JOE'S", 60, "2026-10-20"),
        tx("TRADER JOE'S", 40, "2026-11-01"),
        tx("LOCAL FARMERS MARKET", 80, "2026-11-02"),
        tx("LOCAL FARMERS MARKET", 20, "2026-11-03"),
        tx("EVERSOURCE", 220, "2026-11-04"),
        tx("PAYCHECK", 2000, "2026-11-01", "deposit"),
        tx("OLD STORE", 50, "2026-08-31"),
      ],
      { months: 3, limit: 2, asOf },
    );

    expect(result.count).toBe(3);
    expect(result.months).toBe(3);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      name: "TRADER JOE'S",
      category: "groceries",
      transactionCount: 3,
      total: 200,
      _id: "merchant:trader-joe-s",
    });
    expect(result.items[1]).toMatchObject({
      name: "LOCAL FARMERS MARKET",
      category: "groceries",
      transactionCount: 2,
      total: 100,
    });
  });

  it("breaks frequency ties by total spend and includes one row per merchant", () => {
    const result = buildTopMerchants(
      [
        tx("CORNER CAFE", 10, "2026-10-01"),
        tx("CORNER CAFE", 10, "2026-10-02"),
        tx("BIG STORE", 50, "2026-10-03"),
        tx("BIG STORE", 40, "2026-10-04"),
      ],
      { months: 3, asOf },
    );
    expect(result.items.map((item) => item.name)).toEqual(["BIG STORE", "CORNER CAFE"]);
    expect(result.items[0]?.total).toBe(90);
  });

  it("returns no items when no withdrawals are in the window", () => {
    const result = buildTopMerchants(
      [tx("PAYCHECK", 2000, "2026-11-01", "deposit")],
      { months: 1, asOf },
    );
    expect(result.count).toBe(0);
    expect(result.items).toEqual([]);
  });
});

describe("goal projection", () => {
  it("returns null months when net cashflow is not positive", () => {
    const projection = projectGoal(1000, -20, 5000);
    expect(projection.monthsToTarget).toBeNull();
    expect(projection.onTrack).toBe(false);
  });

  it("ceils months to target and projects balances", () => {
    const projection = projectGoal(1000, 400, 2000);
    expect(projection.monthsToTarget).toBe(3);
    expect(projection.onTrack).toBe(true);
    expect(projection.projections[0]).toEqual({ months: 3, projectedBalance: 2200 });
  });
});

describe("format helpers", () => {
  it("rounds money and truncates text", () => {
    expect(toMoney(1.005)).toBe(1.01);
    expect(truncateText("abcdef", 4)).toBe("abc\u2026");
  });

  it("masks account numbers to the last four digits", () => {
    expect(maskAccountNumber("7830440491226726")).toBe("\u2022\u2022\u2022\u2022 6726");
    expect(maskAccountNumber(undefined)).toBe("\u2022\u2022\u2022\u2022 ????");
  });
});
