// Product tiles inherit the active theme from the wallet or signup page.
function themedGradient(light: string, dark: string): string {
  return `var(--dark, linear-gradient(115deg, ${dark})) var(--light, linear-gradient(115deg, ${light}))`;
}

const discoverGrain = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.04'/%3E%3C/svg%3E")`;

const discoverGradient = [
  discoverGrain,
  'radial-gradient(at 15% 20%, #84d2f6 0px, transparent 55%)',
  'radial-gradient(at 78% 8%, #f3d9c6 0px, transparent 40%)',
  'radial-gradient(at 95% 15%, #cf89bc 0px, transparent 45%)',
  'radial-gradient(at 48% 82%, #d5f0ea 0px, transparent 50%)',
  'radial-gradient(at 8% 88%, #c7a4d6 0px, transparent 45%)',
  'radial-gradient(at 85% 75%, #776eb5 0px, transparent 60%)',
  '#96b8e8'
].join(', ');

// The Discover personal loan keeps the original metallic treatment.
const discoverLoanGradient = themedGradient(
  '#b7b9bc, #eff0f1 62%, #f2b88a',
  '#2b2928, #41403f 62%, #65432d'
);
const discoverLoanInk = 'light-dark(#24201c, #f7f7f7)';

export const products = {
  checking: {
    name: '360 Checking',
    url: 'https://www.capitalone.com/bank/checking-accounts/online-checking-account/',
    gradient: 'linear-gradient(to top, #023c5b, transparent 25%), linear-gradient(105deg, #023c5b, #175071)',
    ink: '#fff'
  },
  savings: {
    name: '360 Performance Savings',
    url: 'https://www.capitalone.com/bank/savings-accounts/online-performance-savings-account/',
    gradient: themedGradient('#013d5b, #076779', '#142b33, #194752'),
    ink: '#fff'
  },
  savor: {
    name: 'Savor',
    url: 'https://www.capitalone.com/credit-cards/savor/',
    gradient: themedGradient('#74321d, #a64c23 58%, #ac5529', '#3e231a, #682f19 58%, #803d20'),
    ink: '#fff'
  },
  quicksilver: {
    name: 'Quicksilver',
    url: 'https://www.capitalone.com/credit-cards/quicksilver/',
    gradient: themedGradient('#959aa3, #e9ebef 58%, #a9aeb8', '#292b30, #494c53 58%, #363940'),
    ink: 'light-dark(#191d25, #f7f7f7)'
  },
  venture: {
    name: 'Venture Rewards',
    url: 'https://www.capitalone.com/credit-cards/venture/',
    gradient: themedGradient('#102344, #164775 68%, #225a85', '#141e33, #203755 68%, #274465'),
    ink: '#fff'
  },
  discover: {
    name: 'Discover it Cash Back',
    url: 'https://www.discover.com/credit-cards/cash-back/it-card/',
    gradient: discoverGradient,
    ink: '#fff'
  }
} as const;

export type CreditProduct = 'savor' | 'quicksilver' | 'venture' | 'discover';

/** Identify older Nessie accounts by product family and account type. */
export function accountProduct(type: unknown, nickname: unknown) {
  const productType = typeof type === 'string' ? type.toLowerCase() : '';
  if (productType.includes('checking')) return products.checking;
  if (productType.includes('savings')) return products.savings;
  if (!productType.includes('credit')) return undefined;

  const name = typeof nickname === 'string' ? nickname.toLowerCase() : '';
  if (name.includes('discover')) return products.discover;
  if (name.includes('savor')) return products.savor;
  if (name.includes('venture')) return products.venture;
  return products.quicksilver;
}

const loanProducts = {
  auto: { name: 'Capital One Auto Finance', gradient: products.savings.gradient, ink: '#fff' },
  personal: { name: 'Discover Personal Loan', gradient: discoverLoanGradient, ink: discoverLoanInk }
} as const;

export function loanProduct(type: unknown) {
  if (typeof type !== 'string') return;
  switch (type.toLowerCase()) {
    case 'auto':
    case 'auto loan':
      return loanProducts.auto;
    case 'personal':
    case 'personal loan':
      return loanProducts.personal;
  }
}

export function loanProductName(type: unknown): string | undefined {
  return loanProduct(type)?.name;
}
