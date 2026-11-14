import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { NessieClient, type FetchLike } from "./client";
import { registerAllTools } from "./tools/index";

const ATMS = [
  {
    _id: "atm-1",
    name: "Arlington 1",
    language_list: ["English", "Spanish"],
    geocode: { lat: 38.8816, lng: -77.091 },
    hours: ["MON-FRI 8:00-20:00"],
    accessibility: true,
    amount_left: 1200,
  },
  {
    _id: "atm-2",
    name: "Arlington 2",
    language_list: ["English"],
    geocode: { lat: 38.8801, lng: -77.102 },
    hours: ["24 HOURS"],
    accessibility: false,
    amount_left: 0,
  },
  {
    _id: "atm-3",
    name: "WMATA - Ballston 1",
    language_list: ["English"],
    geocode: { lat: 38.882, lng: -77.111 },
    hours: ["MON-SUN 5:00-23:00"],
    accessibility: true,
    amount_left: 340,
  },
  {
    _id: "atm-4",
    name: "Arlington 3",
    language_list: ["English"],
    geocode: { lat: 38.869, lng: -77.083 },
    hours: ["24 HOURS"],
    accessibility: true,
    amount_left: 900,
  },
  {
    _id: "atm-5",
    name: "Arlington 4",
    language_list: ["English"],
    geocode: { lat: 38.89, lng: -77.07 },
    hours: ["24 HOURS"],
    accessibility: false,
    amount_left: 75,
  },
  {
    _id: "atm-6",
    name: "Seven Corners 1",
    language_list: ["English"],
    geocode: { lat: 38.864, lng: -77.155 },
    hours: ["MON-SAT 9:00-18:00"],
    accessibility: true,
    amount_left: 500,
  },
  {
    _id: "atm-7",
    name: "Arlington 5",
    language_list: ["English"],
    geocode: { lat: 38.875, lng: -77.095 },
    hours: ["24 HOURS"],
    accessibility: true,
    amount_left: 610,
  },
];

const BRANCHES = [
  {
    _id: "branch-1",
    name: "Arlington",
    phone_number: "703-555-0100",
    hours: ["MON-FRI 9:00-17:00"],
    notes: ["Drive-thru available"],
    address: {
      street_number: "2900",
      street_name: "N Glebe Rd",
      city: "Arlington",
      state: "VA",
      zip: "22207",
    },
  },
  {
    _id: "branch-2",
    name: "Ballston",
    phone_number: "703-555-0101",
    hours: ["MON-FRI 9:00-17:00"],
    notes: [],
    address: {
      street_number: "900",
      street_name: "N Stuart St",
      city: "Arlington",
      state: "VA",
      zip: "22203",
    },
  },
  {
    _id: "branch-3",
    name: "Dupont Circle",
    phone_number: "202-555-0102",
    hours: ["MON-FRI 9:00-17:00"],
    notes: [],
    address: {
      street_number: "1500",
      street_name: "Connecticut Ave NW",
      city: "Washington",
      state: "DC",
      zip: "20009",
    },
  },
];

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const fakeFetch: FetchLike = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/atms")) return jsonResponse(ATMS);
  if (url.includes("/branches")) return jsonResponse(BRANCHES);
  return jsonResponse([]);
}) as FetchLike;

async function callTool(name: string, args: Record<string, unknown>) {
  const nessie = new NessieClient({ apiKey: "test-key", fetchImpl: fakeFetch });
  const server = new McpServer({ name: "location-test", version: "0.1.0" });
  registerAllTools(server, nessie);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "location-client", version: "0.1.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const response = await client.callTool({ name, arguments: args });
    const content = response.content as Array<{ type: string; text?: string }>;
    return JSON.parse(content[0]?.text ?? "{}") as Record<string, unknown>;
  } finally {
    await client.close();
    await server.close();
  }
}

describe("find_nearby_atms", () => {
  it("matches by ATM name and returns no address field", async () => {
    const payload = await callTool("find_nearby_atms", { location: "Arlington" });
    const results = payload.results as Array<Record<string, unknown>>;
    expect(Number(payload.count)).toBeGreaterThanOrEqual(5);
    expect(results.length).toBeGreaterThanOrEqual(5);
    for (const result of results) {
      expect(result).not.toHaveProperty("address");
      expect(result.note).toBe(
        "ATM records have no street address; matched by name only",
      );
      expect(result.lat).toBeTypeOf("number");
      expect(result.lng).toBeTypeOf("number");
    }
  });

  it("returns zero for a zip because ATMs have no zip", async () => {
    const payload = await callTool("find_nearby_atms", { location: "22207" });
    expect(payload.count).toBe(0);
    expect(payload.message).toBe('No ATMs found matching "22207".');
  });
});

describe("find_nearby_branches", () => {
  it("matches by zip and returns a populated address", async () => {
    const payload = await callTool("find_nearby_branches", { location: "22207" });
    const results = payload.results as Array<Record<string, unknown>>;
    expect(Number(payload.count)).toBeGreaterThanOrEqual(1);
    expect(results[0]?.address).toMatchObject({
      street: "2900 N Glebe Rd",
      city: "Arlington",
      state: "VA",
      zip: "22207",
    });
    expect(results[0]?.phone_number).toBe("703-555-0100");
  });

  it("matches by city case-insensitively", async () => {
    const payload = await callTool("find_nearby_branches", { location: "arlington" });
    const results = payload.results as Array<Record<string, unknown>>;
    expect(Number(payload.count)).toBeGreaterThanOrEqual(1);
    expect(
      results.some(
        (result) =>
          (result.address as Record<string, unknown> | undefined)?.city === "Arlington",
      ),
    ).toBe(true);
  });
});
