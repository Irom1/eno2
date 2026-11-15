import { asksToConfirmAddress } from './signupConfirmation';

/** Infer autofill hints from the current request, never from previously collected details. */
export function signupInputHints(message: string) {
  const normal = { type: 'text' as const, name: 'message', autocomplete: 'off' as const, inputmode: 'text' as const, autocapitalize: 'sentences' as const };
  if (asksToConfirmAddress(message)) return normal;
  // Only inspect the final sentence so echoed profile details do not enable autofill.
  const prompt = message.trim().split(/(?<=[.!?])\s+|\n+/).at(-1) ?? '';
  if (!/\?|\b(?:need|share|enter|provide|tell me|send|type|pick)\b/i.test(prompt)) return normal;
  let autocomplete: 'name' | 'given-name' | 'family-name' | 'street-address' | 'address-level2' | 'address-level1' | 'postal-code' | undefined;
  if (/\b(?:full name|first and last name)\b/i.test(prompt)) autocomplete = 'name';
  else if (/\b(?:last name|surname|family name)\b/i.test(prompt)) autocomplete = 'family-name';
  else if (/\b(?:first name|given name|call you)\b/i.test(prompt)) autocomplete = 'given-name';
  else if (/\bname\b/i.test(prompt)) autocomplete = 'name';
  else if (/\b(?:your|which|what) state\b/i.test(prompt)) autocomplete = 'address-level1';
  else if (/\b(?:address|street)\b/i.test(prompt)) autocomplete = 'street-address';
  else if (/\bcity\b/i.test(prompt)) autocomplete = 'address-level2';
  else if (/\bstate\b/i.test(prompt)) autocomplete = 'address-level1';
  else if (/\b(?:zip|postal code)\b/i.test(prompt)) autocomplete = 'postal-code';
  if (!autocomplete) return normal;
  return { ...normal, name: autocomplete, autocomplete, autocapitalize: 'words' as const };
}
