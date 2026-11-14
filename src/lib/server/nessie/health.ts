import { NessieClient, type NessieClientOptions } from "./client";

export interface NessieHealth {
  ok: boolean;
  customerCount: number;
  warning?: string;
  error?: string;
}

/**
 * Probe Nessie by listing customers. A bad or unassigned key returns HTTP 200
 * with an empty array, so we treat zero customers as a loud warning rather than
 * a healthy result.
 */
export async function checkNessie(options: NessieClientOptions = {}): Promise<NessieHealth> {
  const client = new NessieClient(options);
  try {
    const customers = await client.get<unknown>("/customers");
    const customerCount = Array.isArray(customers) ? customers.length : 0;
    if (customerCount === 0) {
      return {
        ok: true,
        customerCount,
        warning: "key valid but sandbox empty or key unassigned",
      };
    }
    return { ok: true, customerCount };
  } catch (error) {
    return {
      ok: false,
      customerCount: 0,
      error: error instanceof Error ? error.message : "Nessie health check failed",
    };
  }
}
