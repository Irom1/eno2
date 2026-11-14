import type { AccountChoice, SignupAnswers } from './signup';
import type { SpendingPreferences } from './spending';

export const asksToConfirmAddress = (message: string) => /(?:address|mailing)/i.test(message) && /(?:right|correct|look good|confirm|accurate)\b/i.test(message) && message.includes('?');

/** Recognize additional model-confirmed wording without accepting corrections,
 * conditions, negations, new personal details, or information requests. */
export function canAcceptModelApproval(message: string): boolean {
  if (message.includes('?') || (/\d/.test(message) && !/\ball (?:3|three)\b/i.test(message))) return false;
  const text = message.toLowerCase().replace(/[’‘]/g, "'");
  if (/\b(?:no|not|don't|dont|wait|stop|hold|but|except|unless|if|change|edit|tell|explain|show|why|what|how|when|which|before|instead|remove|add|also|only|rather|swap|switch|update|wrong|incorrect|missing|address|street|city|zip|name|checking|savings|credit|maybe|perhaps|cancel)\b/.test(text)) return false;
  return /\b(?:yes|yep|yeah|yup|sure|okay|ok|agree|approve|correct|right|good|great|fine|perfect|lovely|love|absolutely|definitely|proceed|continue|ready)\b/.test(text);
}

/** Accept a positive answer, never a question, condition, or mixed correction. */
export function isAffirmative(message: string): boolean {
  if (message.includes('?')) return false;
  let remaining = message.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z'\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\d/.test(message) && !/\ball (?:3|three)\b/i.test(message)) return false;
  if (/^(?:no problem|no problem at all)$/.test(remaining)) return true;
  if (/\b(?:no|not|don't|dont|wait|stop|hold|but|except|unless|if|change|edit|also|only|swap|switch|update|wrong|incorrect|missing|address|street|city|zip|name|checking|savings|credit)\b/.test(remaining)) return false;
  if (/\b(?:tell|explain|show|why|what|how|when|which|before|instead|remove|add|rather)\b/.test(remaining)) return false;
  if (/\b(?:can|could|would|should)\s+(?:i|we|you)\b/.test(remaining)) return false;
  // Positive statements and explicit creation instructions can be conversational;
  // questions, qualifications and corrections were rejected above.
  if (/^(?:yes+|yep|yup|yeah|sure|okay|ok|absolutely|definitely|correct|perfect|affirmative|agreed)\b/.test(remaining) && !/\b(?:more|details|unsure|maybe|perhaps|cancel)\b/.test(remaining)) return true;
  if (/^(?:(?:everything|it|that|this|that all|all of it)\s+)?(?:looks|sounds|is)\s+(?:all\s+)?(?:good|right|correct|great|perfect|fine)(?:\s+to me)?$/.test(remaining)) return true;
  if (/^(?:(?:please|you can)\s+)?(?:go ahead(?: and)?\s*)?(?:(?:let'?s|lets)\s+)?(?:create|open|set up|make|do|finish|proceed with)\s+(?:(?:my|the|these|those|all)\s+)?(?:profile|accounts?|cards?|it|them|that|three)(?:\s+(?:now|please))?$/.test(remaining)) return true;
  remaining = remaining.replace(/\b(?:please|thank you|thanks|eno)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const phrases = ["go ahead and create my profile", "that's the right address", "that is the right address", "that's my address", "that is my address", "that is correct", "that is right", "that's correct", "that's right", "looks good", "looks right", "sounds good", "all good", "works for me", "that works", "go ahead", "let's do it", "let's go", "lets go", "do it", "all right", "it is", "yes", "yep", "yeah", "yup", "sure", "okay", "ok", "good", "great", "fine", "absolutely", "correct", "right", "perfect", "confirmed", "confirm", "agreed", "definitely", "affirmative", "alright", "proceed", "continue", "ready"];
  let matched = false;
  for (const phrase of phrases) {
    const pattern = new RegExp(`(?:^|\\s)${phrase}(?=\\s|$)`, 'g');
    if (pattern.test(remaining)) { matched = true; remaining = remaining.replace(pattern, ' ').replace(/\s+/g, ' ').trim(); }
  }
  return matched && remaining === '';
}

export function isAddressAffirmative(message: string): boolean {
  if (isAffirmative(message)) return true;
  if (message.includes('?')) return false;
  const text = message.toLowerCase().replace(/[’‘']/g, '').replace(/[^a-z\s]/g, ' ').replace(/\b(?:please|thanks|eno)\b/g, '').replace(/\s+/g, ' ').trim().replace(/^(?:yes|yep|yeah|sure)\s+/, '');
  return ['thats my address', 'that is my address', 'thats the right address', 'that is the right address', 'thats the correct address', 'that is the correct address', 'my address is correct', 'the address is correct', 'the mailing address is correct'].includes(text);
}

export const reviewFingerprint = (answers: SignupAnswers, accountChoice: AccountChoice, spending: SpendingPreferences, includeCreditCard: boolean | null = false): string => JSON.stringify({ answers, accountChoice, spending, includeCreditCard });
