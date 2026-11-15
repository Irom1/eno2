/** These gates only enable deterministic shortcuts. Contextual questions stay
 * with the conversational model instead of being reduced to a keyword route. */
export function isConversationFollowUp(prompt: string): boolean {
  const text = prompt.trim().toLowerCase();
  return /^(?:why\b|how come\b|what (?:makes|made|about)\b|i (?:asked|meant|said)\b)/.test(text) ||
    /^(?:is|was|could|would|should)\b.*\b(?:charge|purchase|transaction)\b.*\b(?:suspicious|unusual|weird|odd|duplicate)\b/.test(text) ||
    /\b(?:this|that|the (?:first|second|third|last)) (?:transaction|purchase|charge|item)\b/.test(text) ||
    /\b(?:that|this|it|those|these|first|second|third|last)\s*(?:one|item|charge|transaction|purchase)?\s+(?:is|was|were|looks?|seems?)\b/.test(text) ||
    /^(?:is|was|does|did|could|would|should|are|were)\s+(?:that|this|it|those|these|the (?:first|second|third|last))\b/.test(text) ||
    /\b(?:you (?:said|showed|included|missed)|(?:i|we) (?:asked|discussed)|not (?:to )?show me|instead of|earlier|previous(?:ly)?)\b/.test(text);
}

export function requestsAnomalyList(prompt: string): boolean {
  if (isConversationFollowUp(prompt)) return false;
  const text = prompt.toLowerCase();
  const topic = /\b(?:suspicious|unusual|weird|odd|strange|duplicate|anomal(?:y|ies)|double[- ]charged)\b/.test(text);
  return topic && (/\b(?:transactions|charges|purchases|activity|anomalies|duplicates)\b/.test(text) ||
    /\b(?:anything|something|any|everything|all)\b/.test(text));
}

export function requestsExplanationOnly(prompt: string): boolean {
  return /^(?:why\b|how come\b|what (?:makes|made)\b|i (?:asked|meant|said)\b)/i.test(prompt.trim());
}
