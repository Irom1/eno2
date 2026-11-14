import { describe, expect, it } from "vitest";
import { assertToolArgsAllowed, buildAllowlist } from "./guard";

const allowlist = buildAllowlist("cust-1", [{ id: "acct-1" }, { _id: "acct-2" }]);

describe("guard", () => {
  it("allows the session's own account", () => {
    expect(assertToolArgsAllowed({ accountId: "acct-1" }, allowlist)).toEqual({ ok: true });
    expect(assertToolArgsAllowed({ accountId: "acct-2", months: 3 }, allowlist)).toEqual({ ok: true });
  });

  it("rejects a foreign account id", () => {
    const result = assertToolArgsAllowed({ accountId: "acct-9" }, allowlist);
    expect(result.ok).toBe(false);
  });

  it("rejects a foreign customer id", () => {
    const result = assertToolArgsAllowed({ customerId: "cust-2" }, allowlist);
    expect(result.ok).toBe(false);
  });

  it("ignores non-id arguments, including nested objects", () => {
    expect(
      assertToolArgsAllowed(
        { days: 30, query: "acct-9", nested: { location: "Arlington" } },
        allowlist
      )
    ).toEqual({ ok: true });
    expect(assertToolArgsAllowed("acct-9", allowlist)).toEqual({ ok: true });
  });
});
