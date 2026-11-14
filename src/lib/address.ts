import type { CustomerCreate, SignupAnswers } from './signup';

export type MailingAddress = CustomerCreate['address'];
export interface AddressCandidate { id: string; label: string; address: MailingAddress }
export interface AddressCheck {
  status: 'matched' | 'correction' | 'not_found' | 'unavailable';
  message: string;
  address?: MailingAddress;
  candidates?: AddressCandidate[];
}
export const addressLabel = (address: MailingAddress): string => `${address.street_number} ${address.street_name}, ${address.city}, ${address.state} ${address.zip}`;
export const answersWithAddress = (answers: SignupAnswers, address: MailingAddress): SignupAnswers => ({ ...answers, ...address });

/** Only send address-shaped text to the autocomplete provider, not other chat. */
export function addressSearchText(text: string): string {
  const query = text.trim().replace(/^(?:my (?:mailing )?address is|i live at|it['’]s at|the address is)\s+/i, '');
  return /^\d+[a-z]?(?:[-/]\d+)?\s+\S{2}/i.test(query) && query.length >= 6 ? query.slice(0, 200) : '';
}
