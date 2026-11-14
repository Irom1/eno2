import { z } from 'zod';

export const STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'],
  ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'], ['WY', 'Wyoming'], ['AS', 'American Samoa'], ['GU', 'Guam'],
  ['MP', 'Northern Mariana Islands'], ['PR', 'Puerto Rico'], ['VI', 'U.S. Virgin Islands']
] as const;

const requiredText = (label: string, max = 80) => z.string().trim().min(1, `I just need your ${label} to keep going.`).max(max, `Could you keep your ${label} under ${max} characters?`);

// Nessie CustomerCreate + Address: https://prod.nessieisreal.com/nessie-openapi-spec.yaml
export const customerCreateSchema = z.object({
  first_name: requiredText('first name'),
  last_name: requiredText('last name'),
  address: z.object({
    street_number: requiredText('street number', 20),
    street_name: requiredText('street name', 160),
    city: requiredText('city'),
    state: z.string().trim().toUpperCase().refine((value) => STATES.some(([code]) => code === value), 'Pick your state so I can put the address together.'),
    zip: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/, 'That ZIP needs 5 digits, like 02139. ZIP+4 works too.')
  })
});

export type CustomerCreate = z.infer<typeof customerCreateSchema>;
export const accountChoiceSchema = z.enum(['undecided', 'none', 'checking', 'savings', 'both']);
export type AccountChoice = z.infer<typeof accountChoiceSchema>;
export const accountTypesFor = (choice: AccountChoice): ('Checking' | 'Savings')[] => choice === 'both' ? ['Checking', 'Savings'] : choice === 'checking' ? ['Checking'] : choice === 'savings' ? ['Savings'] : [];

/** Normalize obvious state-name typos, while leaving ambiguous answers alone. */
export function normalizeState(value: string): string {
  const clean = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '');
  const target = clean(value);
  const exact = STATES.find(([code, name]) => clean(code) === target || clean(name) === target);
  if (exact) return exact[0];
  if (target.length < 5) return value.trim().toUpperCase();
  const distance = (a: string, b: string) => {
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = row;
    }
    return previous[b.length];
  };
  const candidates = STATES.map(([code, name]) => ({ code, distance: distance(target, clean(name)) })).filter((item) => item.distance <= 2).sort((a, b) => a.distance - b.distance);
  return candidates.length && (candidates.length === 1 || candidates[0].distance < candidates[1].distance) ? candidates[0].code : value.trim().toUpperCase();
}
export type SignupField = 'first_name' | 'last_name' | 'street_number' | 'street_name' | 'city' | 'state' | 'zip';
export const SIGNUP_FIELDS: SignupField[] = ['first_name', 'last_name', 'street_number', 'street_name', 'city', 'state', 'zip'];
export type SignupAnswers = Record<SignupField, string>;
export const emptyAnswers = (): SignupAnswers => ({ first_name: '', last_name: '', street_number: '', street_name: '', city: '', state: '', zip: '' });

export function customerFromAnswers(answers: SignupAnswers): CustomerCreate {
  return {
    first_name: answers.first_name.trim(), last_name: answers.last_name.trim(),
    address: {
      street_number: answers.street_number.trim(), street_name: answers.street_name.trim(),
      city: answers.city.trim(), state: answers.state.trim().toUpperCase(), zip: answers.zip.trim()
    }
  };
}

export function validateAnswer(field: SignupField, value: string): string {
  const schema = field === 'first_name' || field === 'last_name'
    ? customerCreateSchema.shape[field]
    : customerCreateSchema.shape.address.shape[field];
  const result = schema.safeParse(value);
  return result.success ? '' : result.error.issues[0].message;
}
