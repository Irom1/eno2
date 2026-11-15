import { expect, it } from 'vitest';
import { billListCard } from './entityCards';

it('renders all nine upcoming bills without truncation and preserves account links', () => {
  const bills = Array.from({ length: 9 }, (_, index) => ({
    billId: `bill-${index}`,
    accountId: `account-${index % 3}`,
    payee: `Utility ${index}`,
    amount: 100 - index,
    dueDate: `2026-11-${20 + index}`
  }));
  const card = billListCard({ bills, count: 9 }, 42, 5, { customerId: 'customer' });
  expect(card?.payload.more).toBe(0);
  expect(card?.payload.rows).toEqual(bills.map(({ billId, ...bill }) => ({
    ...bill, id: billId, customerId: 'customer'
  })));
  expect(card?.afterText).toBe(42);
});
