/**
 * Raw read-only Nessie tools: one tool per allowed GET endpoint.
 * No write endpoints are registered here, and there is no generic proxy tool.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { maskAccountNumber, type NessieClient } from "../client";
import { clampRows, safeJson, toMoney, truncateText } from "../format";

export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  idempotentHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

type AnyRecord = Record<string, unknown>;

const idParam = z.string().min(1).describe("Opaque id; do not assume format");

const rec = (value: unknown): AnyRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};

const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const text = (value: unknown, max = 160): string => truncateText(value, max);

const addressSummary = (value: unknown): unknown => {
  const address = rec(value);
  if (Object.keys(address).length === 0) return undefined;
  return {
    street: [address.street_number, address.street_name].filter(Boolean).join(" ").trim(),
    city: address.city,
    state: address.state,
    zip: address.zip,
  };
};

const customerSummary = (value: unknown) => {
  const customer = rec(value);
  return {
    _id: customer._id,
    firstName: customer.first_name,
    lastName: customer.last_name,
    address: addressSummary(customer.address),
  };
};

const accountSummary = (value: unknown) => {
  const account = rec(value);
  return {
    _id: account._id,
    type: account.type,
    nickname: account.nickname,
    balance: toMoney(num(account.balance)),
    rewards: num(account.rewards),
    accountNumber: maskAccountNumber(account.account_number),
    customerId: account.customer_id,
  };
};

const billSummary = (value: unknown) => {
  const bill = rec(value);
  return {
    _id: bill._id,
    status: bill.status,
    payee: text(bill.payee),
    nickname: text(bill.nickname),
    paymentAmount: toMoney(num(bill.payment_amount)),
    upcomingPaymentDate: bill.upcoming_payment_date,
    recurringDate: bill.recurring_date,
    paymentDate: bill.payment_date,
    creationDate: bill.creation_date,
    accountId: bill.account_id,
  };
};

const depositSummary = (value: unknown) => {
  const deposit = rec(value);
  return {
    _id: deposit._id,
    type: deposit.type,
    status: deposit.status,
    amount: toMoney(num(deposit.amount)),
    description: text(deposit.description),
    transactionDate: deposit.transaction_date,
    medium: deposit.medium,
  };
};

const withdrawalSummary = (value: unknown) => {
  const withdrawal = rec(value);
  return {
    _id: withdrawal._id,
    type: withdrawal.type,
    status: withdrawal.status,
    amount: toMoney(num(withdrawal.amount)),
    description: text(withdrawal.description),
    transactionDate: withdrawal.transaction_date,
    medium: withdrawal.medium,
  };
};

const loanSummary = (value: unknown) => {
  const loan = rec(value);
  return {
    _id: loan._id,
    type: loan.type,
    status: loan.status,
    monthlyPayment: toMoney(num(loan.monthly_payment)),
    amount: toMoney(num(loan.amount)),
    description: text(loan.description),
    creditScore: num(loan.credit_score),
    creationDate: loan.creation_date,
    accountId: loan.account_id,
  };
};

const merchantSummary = (value: unknown) => {
  const merchant = rec(value);
  return {
    _id: merchant._id,
    name: text(merchant.name),
    category: merchant.category,
    address: addressSummary(merchant.address),
  };
};

const locationSummary = (value: unknown) => {
  const location = rec(value);
  // Branches return `address`; some ATM payloads use `physical_address`.
  const address = rec(location.address ?? location.physical_address);
  const geocode = rec(location.geocode);
  return {
    _id: location._id,
    name: text(location.name),
    hours: location.hours,
    address: addressSummary(address),
    phone: location.phone_number,
    notes: location.notes,
    accessibility: location.accessibility,
    amountLeft: location.amount_left,
    languages: location.language_list,
    lat: geocode.lat,
    lng: geocode.lng,
  };
};

const listResult = (data: unknown, map: (value: unknown) => unknown) => {
  const rows = Array.isArray(data) ? data : [];
  const clamped = clampRows(rows, 50);
  return {
    count: clamped.count,
    truncated: clamped.truncated,
    items: clamped.rows.map(map),
  };
};

const ok = (summary: unknown) => ({
  content: [{ type: "text" as const, text: safeJson(summary) }],
});

export function registerRawTools(server: McpServer, client: NessieClient): void {
  server.registerTool(
    "nessie_list_customers",
    {
      description: "List Nessie customers (read-only). Use ids returned here for other tools.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {},
    },
    async () => ok(listResult(await client.get("/customers"), customerSummary)),
  );

  server.registerTool(
    "nessie_get_customer",
    {
      description: "Get a single Nessie customer by id (read-only).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { customerId: idParam },
    },
    async ({ customerId }) =>
      ok(customerSummary(await client.get(`/customers/${encodeURIComponent(customerId)}`))),
  );

  server.registerTool(
    "nessie_list_customer_accounts",
    {
      description: "List a customer's accounts (read-only). Account numbers are masked.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { customerId: idParam },
    },
    async ({ customerId }) =>
      ok(
        listResult(
          await client.get(`/customers/${encodeURIComponent(customerId)}/accounts`),
          accountSummary,
        ),
      ),
  );

  server.registerTool(
    "nessie_list_customer_bills",
    {
      description: "List a customer's bills (read-only).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { customerId: idParam },
    },
    async ({ customerId }) =>
      ok(
        listResult(
          await client.get(`/customers/${encodeURIComponent(customerId)}/bills`),
          billSummary,
        ),
      ),
  );

  server.registerTool(
    "nessie_get_account",
    {
      description: "Get a single account by id (read-only). The account number is masked.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { accountId: idParam },
    },
    async ({ accountId }) =>
      ok(accountSummary(await client.get(`/accounts/${encodeURIComponent(accountId)}`))),
  );

  server.registerTool(
    "nessie_get_account_customer",
    {
      description: "Get the customer that owns an account (read-only).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { accountId: idParam },
    },
    async ({ accountId }) =>
      ok(
        customerSummary(
          await client.get(`/accounts/${encodeURIComponent(accountId)}/customer`),
        ),
      ),
  );

  server.registerTool(
    "nessie_list_account_bills",
    {
      description: "List bills associated with an account (read-only).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { accountId: idParam },
    },
    async ({ accountId }) =>
      ok(
        listResult(
          await client.get(`/accounts/${encodeURIComponent(accountId)}/bills`),
          billSummary,
        ),
      ),
  );

  server.registerTool(
    "nessie_list_account_deposits",
    {
      description: "List deposits for an account (read-only).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { accountId: idParam },
    },
    async ({ accountId }) =>
      ok(
        listResult(
          await client.get(`/accounts/${encodeURIComponent(accountId)}/deposits`),
          depositSummary,
        ),
      ),
  );

  server.registerTool(
    "nessie_list_account_withdrawals",
    {
      description: "List withdrawals for an account (read-only).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { accountId: idParam },
    },
    async ({ accountId }) =>
      ok(
        listResult(
          await client.get(`/accounts/${encodeURIComponent(accountId)}/withdrawals`),
          withdrawalSummary,
        ),
      ),
  );

  server.registerTool(
    "nessie_list_account_loans",
    {
      description: "List loans for an account (read-only).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { accountId: idParam },
    },
    async ({ accountId }) =>
      ok(
        listResult(
          await client.get(`/accounts/${encodeURIComponent(accountId)}/loans`),
          loanSummary,
        ),
      ),
  );

  server.registerTool(
    "nessie_get_bill",
    {
      description: "Get a single bill by id (read-only).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { billId: idParam },
    },
    async ({ billId }) =>
      ok(billSummary(await client.get(`/bills/${encodeURIComponent(billId)}`))),
  );

  server.registerTool(
    "nessie_get_deposit",
    {
      description: "Get a single deposit by id (read-only).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { depositId: idParam },
    },
    async ({ depositId }) =>
      ok(depositSummary(await client.get(`/deposits/${encodeURIComponent(depositId)}`))),
  );

  server.registerTool(
    "nessie_get_loan",
    {
      description: "Get a single loan by id (read-only).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { loanId: idParam },
    },
    async ({ loanId }) =>
      ok(loanSummary(await client.get(`/loans/${encodeURIComponent(loanId)}`))),
  );

  server.registerTool(
    "nessie_get_purchase",
    {
      description: "Get a single purchase (card transaction) by id (read-only).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { purchaseId: idParam },
    },
    async ({ purchaseId }) =>
      ok(
        withdrawalSummary(
          await client.get(`/purchase/${encodeURIComponent(purchaseId)}`),
        ),
      ),
  );

  server.registerTool(
    "nessie_get_transfer",
    {
      description: "Get a single transfer by id (read-only).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { transferId: idParam },
    },
    async ({ transferId }) =>
      ok(
        withdrawalSummary(
          await client.get(`/transfers/${encodeURIComponent(transferId)}`),
        ),
      ),
  );

  server.registerTool(
    "nessie_get_withdrawal",
    {
      description: "Get a single withdrawal by id (read-only).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { withdrawalId: idParam },
    },
    async ({ withdrawalId }) =>
      ok(
        withdrawalSummary(
          await client.get(`/withdrawal/${encodeURIComponent(withdrawalId)}`),
        ),
      ),
  );

  server.registerTool(
    "nessie_list_merchants",
    {
      description: "List known merchants (read-only). May be empty for some keys.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {},
    },
    async () => ok(listResult(await client.get("/merchants"), merchantSummary)),
  );

  server.registerTool(
    "nessie_get_merchant",
    {
      description: "Get a single merchant by id (read-only).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { merchantId: idParam },
    },
    async ({ merchantId }) =>
      ok(merchantSummary(await client.get(`/merchants/${encodeURIComponent(merchantId)}`))),
  );

  server.registerTool(
    "nessie_list_atms",
    {
      description: "List ATMs (read-only). Use find_nearby_atms for location filtering.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {},
    },
    async () => ok(listResult(await client.get("/atms"), locationSummary)),
  );

  server.registerTool(
    "nessie_get_atm",
    {
      description: "Get a single ATM by id (read-only).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { atmId: idParam },
    },
    async ({ atmId }) =>
      ok(locationSummary(await client.get(`/atms/${encodeURIComponent(atmId)}`))),
  );

  server.registerTool(
    "nessie_list_branches",
    {
      description: "List branches (read-only). Use find_nearby_branches for location filtering.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {},
    },
    async () => ok(listResult(await client.get("/branches"), locationSummary)),
  );

  server.registerTool(
    "nessie_get_branch",
    {
      description: "Get a single branch by id (read-only).",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { branchId: idParam },
    },
    async ({ branchId }) =>
      ok(locationSummary(await client.get(`/branches/${encodeURIComponent(branchId)}`))),
  );
}

/** Names of every raw tool, in registration order. Kept for registry tests. */
export const RAW_TOOL_NAMES = [
  "nessie_list_customers",
  "nessie_get_customer",
  "nessie_list_customer_accounts",
  "nessie_list_customer_bills",
  "nessie_get_account",
  "nessie_get_account_customer",
  "nessie_list_account_bills",
  "nessie_list_account_deposits",
  "nessie_list_account_withdrawals",
  "nessie_list_account_loans",
  "nessie_get_bill",
  "nessie_get_deposit",
  "nessie_get_loan",
  "nessie_get_purchase",
  "nessie_get_transfer",
  "nessie_get_withdrawal",
  "nessie_list_merchants",
  "nessie_get_merchant",
  "nessie_list_atms",
  "nessie_get_atm",
  "nessie_list_branches",
  "nessie_get_branch",
] as const;
