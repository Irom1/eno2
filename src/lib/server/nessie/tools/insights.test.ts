import { describe, expect, it } from "vitest";
import { summarizeAnomalyPatterns } from "./insights";

describe("summarizeAnomalyPatterns", () => {
  it("describes several unusually large purchases and a possible duplicate", () => {
    expect(summarizeAnomalyPatterns(1, 3)).toBe(
      "I found several unusually large purchases and a possible duplicate."
    );
  });

  it("describes a single outlier and several duplicates", () => {
    expect(summarizeAnomalyPatterns(2, 1)).toBe(
      "I found an unusually large purchase and several possible duplicates."
    );
  });

  it("describes only outliers", () => {
    expect(summarizeAnomalyPatterns(0, 1)).toBe("I found an unusually large purchase.");
    expect(summarizeAnomalyPatterns(0, 2)).toBe("I found several unusually large purchases.");
  });

  it("describes only duplicates", () => {
    expect(summarizeAnomalyPatterns(1, 0)).toBe("I found a possible duplicate.");
    expect(summarizeAnomalyPatterns(2, 0)).toBe("I found several possible duplicates.");
  });

  it("uses one grammatical construction for every combination", () => {
    expect(summarizeAnomalyPatterns(1, 1)).toBe(
      "I found an unusually large purchase and a possible duplicate."
    );
    expect(summarizeAnomalyPatterns(6, 4)).toBe(
      "I found several unusually large purchases and several possible duplicates."
    );
  });

  it("handles nothing unusual", () => {
    expect(summarizeAnomalyPatterns(0, 0)).toBe("Nothing unusual stood out.");
  });
});
