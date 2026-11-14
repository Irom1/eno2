import { describe, expect, it } from "vitest";
import { extractLocation } from "./locationQuery";

describe("extractLocation", () => {
  it("understands 'in' with a city and state", () => {
    expect(extractLocation("Find ATMs in Cambridge, Massachusetts", "Arlington")).toBe(
      "Cambridge, Massachusetts",
    );
  });

  it("understands each supported location keyword", () => {
    const cases: Array<[string, string]> = [
      ["ATMs around Cambridge", "Cambridge"],
      ["Find an ATM near Arlington", "Arlington"],
      ["Find an ATM within Boston", "Boston"],
      ["Find an ATM at Ballston Common Mall", "Ballston Common Mall"],
      ["Find an ATM close to Dupont Circle", "Dupont Circle"],
      ["Find a branch in Arlington", "Arlington"],
      ["Find an ATM in Arlington, VA", "Arlington, VA"],
    ];
    for (const [message, expected] of cases) {
      expect(extractLocation(message, "fallback")).toBe(expected);
    }
  });

  it("strips trailing punctuation", () => {
    expect(extractLocation("Find ATMs in Cambridge, Massachusetts?", "fallback")).toBe(
      "Cambridge, Massachusetts",
    );
    expect(extractLocation("Find ATMs near Arlington!", "fallback")).toBe("Arlington");
    expect(extractLocation("Find ATMs around Boston.", "fallback")).toBe("Boston");
    expect(extractLocation("Find ATMs near Arlington;", "fallback")).toBe("Arlington");
  });

  it("strips leading articles", () => {
    expect(extractLocation("Find ATMs near the Clarendon area", "fallback")).toBe(
      "Clarendon area",
    );
    expect(extractLocation("Find ATMs in a place called Ballston", "fallback")).toBe(
      "place called Ballston",
    );
    expect(extractLocation("Find ATMs around an area near Dupont", "fallback")).toBe(
      "Dupont",
    );
  });

  it("prefers the right-most, most complete place phrase", () => {
    expect(extractLocation("Find an ATM near my home in Arlington", "fallback")).toBe(
      "Arlington",
    );
  });

  it("falls back when the message has no location phrase", () => {
    expect(extractLocation("Where is the closest ATM?", "Arlington")).toBe("Arlington");
    expect(extractLocation("Show me my recent transactions", "Arlington")).toBe("Arlington");
    expect(extractLocation("", "Arlington")).toBe("Arlington");
  });

  it("does not mistake ATM for the 'at' keyword", () => {
    expect(extractLocation("Find an ATM", "Arlington")).toBe("Arlington");
  });
});
