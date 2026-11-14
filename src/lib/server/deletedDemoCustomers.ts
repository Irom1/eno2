// Nessie cannot delete customer records. Persist these removed demo profiles
// by ID so new sign-ups remain available, including profiles with reused names.
const deletedCustomerIds = new Set([
  '0faf79ee-10ef-4ce5-ab7d-39d414679a9e',
  '228212fe-2bb9-43c5-8047-60e89fb07d0b',
  '4bebbd39-b51d-4546-b606-6fa48495fba0',
  '56d77bc8-eed0-4d53-9a0e-55d0a0c1f31d',
  '9cda4e7a-5033-4e43-9808-b627c81ebb3a',
  'bb018e65-f3d1-430f-a4a7-12757b7925b0',
  'd28d5766-97ec-42d2-8398-5bd0fd31000e',
  'e6f79569-5107-4e41-b209-d802b50aeb87',
  'f954275c-eee8-4e6d-84fb-30fc783a0eb6'
]);

const runtime = globalThis as typeof globalThis & { __enoRemovedCustomers?: Set<string> };
const removedThisProcess = runtime.__enoRemovedCustomers ??= new Set<string>();

export function markDemoCustomerDeleted(customerId: string): void { removedThisProcess.add(customerId); }
export function restoreDemoCustomer(customerId: string): void { removedThisProcess.delete(customerId); }

export function isDeletedDemoCustomer(customerId: string): boolean {
  return deletedCustomerIds.has(customerId) || removedThisProcess.has(customerId);
}
