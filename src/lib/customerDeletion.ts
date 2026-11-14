export interface CustomerIdentity { id?: string; firstName?: string; lastName?: string; first_name?: string; last_name?: string }
export const DELETED_CUSTOMER_PREFIX = '[Eno deleted] ';
export const customerFirstName = (customer: CustomerIdentity) => customer.firstName ?? customer.first_name ?? '';
export const customerLastName = (customer: CustomerIdentity) => customer.lastName ?? customer.last_name ?? '';
export const originalFirstName = (name: string) => name.startsWith(DELETED_CUSTOMER_PREFIX) ? name.slice(DELETED_CUSTOMER_PREFIX.length) : name;
export const isRemovedCustomer = (customer: CustomerIdentity) => customerFirstName(customer).startsWith(DELETED_CUSTOMER_PREFIX);
export function isProtectedCustomer(customer: CustomerIdentity): boolean {
  const name = `${originalFirstName(customerFirstName(customer))} ${customerLastName(customer)}`.toLowerCase().replace(/\s+/g, ' ').trim();
  return name === 'maya chen' || name === 'demo tester';
}
export const customerName = (customer: CustomerIdentity) => `${originalFirstName(customerFirstName(customer))} ${customerLastName(customer)}`.trim();
