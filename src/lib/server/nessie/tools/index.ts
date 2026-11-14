import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NessieClient } from "../client";
import { registerInsightTools, INSIGHT_TOOL_NAMES } from "./insights";
import { registerRawTools, RAW_TOOL_NAMES } from "./raw";

/**
 * Every raw tool mapped to the read-only GET route template it calls.
 * The contract test asserts that no tool exists outside this table or the
 * insight/find tools. Placeholders use `{id}`.
 */
export const READ_ONLY_ROUTES: Record<string, string> = {
  nessie_list_customers: "/customers",
  nessie_get_customer: "/customers/{id}",
  nessie_list_customer_accounts: "/customers/{id}/accounts",
  nessie_list_customer_bills: "/customers/{id}/bills",
  nessie_get_account: "/accounts/{id}",
  nessie_get_account_customer: "/accounts/{id}/customer",
  nessie_list_account_bills: "/accounts/{id}/bills",
  nessie_list_account_deposits: "/accounts/{id}/deposits",
  nessie_list_account_withdrawals: "/accounts/{id}/withdrawals",
  nessie_list_account_loans: "/accounts/{id}/loans",
  nessie_get_bill: "/bills/{id}",
  nessie_get_deposit: "/deposits/{id}",
  nessie_get_loan: "/loans/{id}",
  nessie_get_purchase: "/purchase/{id}",
  nessie_get_transfer: "/transfers/{id}",
  nessie_get_withdrawal: "/withdrawal/{id}",
  nessie_list_merchants: "/merchants",
  nessie_get_merchant: "/merchants/{id}",
  nessie_list_atms: "/atms",
  nessie_get_atm: "/atms/{id}",
  nessie_list_branches: "/branches",
  nessie_get_branch: "/branches/{id}",
};

export const RAW_TOOL_COUNT = RAW_TOOL_NAMES.length;
export const INSIGHT_TOOL_COUNT = INSIGHT_TOOL_NAMES.length;
export const TOOL_COUNT = RAW_TOOL_COUNT + INSIGHT_TOOL_COUNT;

export function registerAllTools(
  server: McpServer,
  client: NessieClient = new NessieClient(),
): void {
  registerRawTools(server, client);
  registerInsightTools(server, client);
}

export { INSIGHT_TOOL_NAMES, RAW_TOOL_NAMES };
