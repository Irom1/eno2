import { describe, expect, it } from "vitest";
import { dateLabel, daysLabel, initials, money, moneyWhole, monthLabel, titleCase } from "./format";

describe("format", () => {
  it("formats money with cents only when present", () => {
    expect(money(4283.59)).toBe("$4,283.59");
    expect(money(4218)).toBe("$4,218");
    expect(money(-65.59)).toBe("-$65.59");
    expect(money(12, { signed: true })).toBe("+$12");
  });

  it("formats whole dollars", () => {
    expect(moneyWhole(4218)).toBe("$4,218");
    expect(moneyWhole(4283.59)).toBe("$4,284");
  });

  it("formats month and date labels without timezone drift", () => {
    expect(monthLabel("2026-10")).toBe("Oct 2026");
    expect(monthLabel("bad")).toBe("bad");
    expect(dateLabel("2026-12-05")).toBe("Dec 5");
    expect(dateLabel("2026-12-31")).toBe("Dec 31");
  });

  it("formats relative days", () => {
    expect(daysLabel(17)).toBe("in 17 days");
    expect(daysLabel(1)).toBe("in 1 day");
    expect(daysLabel(0)).toBe("today");
    expect(daysLabel(-3)).toBe("3 days ago");
  });

  it("formats initials and titles", () => {
    expect(initials("Maya Chen")).toBe("MC");
    expect(initials("  maya  ")).toBe("M");
    expect(titleCase("credit card")).toBe("Credit Card");
  });
});
