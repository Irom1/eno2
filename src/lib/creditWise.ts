/** Stable, fictional score seeded by each Nessie customer's randomly assigned ID. */
export function demoCreditScore(customerId: string): number {
  let hash = 2166136261;
  for (const character of customerId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return 300 + hash % 551;
}

export function creditScoreRating(score: number) {
  if (score < 580) return { label: 'Poor', color: '#d74747' };
  if (score < 670) return { label: 'Fair', color: '#d77a25' };
  if (score < 740) return { label: 'Good', color: '#b59922' };
  if (score < 800) return { label: 'Very good', color: '#5c9635' };
  return { label: 'Excellent', color: '#27926a' };
}
