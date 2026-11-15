const jokes = [
  'Gotta make a couple hundred demo purchases real quick ;)',
  'Squeezing three months of demo shopping into a few seconds. Very responsible of me ;)'
] as const;

export function accountSetupJoke(): string {
  return jokes[Math.floor(Math.random() * jokes.length)];
}
