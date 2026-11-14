# eno2

A TypeScript SvelteKit starter for Cloudflare Workers. The Cloudflare adapter bundles server-rendered routes and static assets for Wrangler.

## Local development

Use Node.js 22.12+ on the 22.x line, or Node.js 24+.

```sh
npm ci
npm run dev
```

Edit `src/routes/+page.svelte` to change the home page. Run `npm run check` to check Svelte and TypeScript. Run `npm run preview` to build and serve the app locally in the Workers runtime. Wrangler prints the URL.

The home page links to `/signup`, a conversational onboarding flow powered by the configured Gemini model. Eno collects only the name and mailing address required by Nessie; no email is requested. After those details, a spending-category checklist appears in the chat. The first selected category is the top priority: travel → [Capital One Venture](https://www.capitalone.com/credit-cards/venture/); dining/groceries/entertainment → [Capital One Savor](https://www.capitalone.com/credit-cards/savor/); other everyday spending → [Capital One Quicksilver](https://www.capitalone.com/credit-cards/quicksilver/). The next checklist starts with checking, savings, and the matching credit card checked. Users can uncheck any option, including all three, before the final profile review. Product names are real, but the accounts, rewards, loans, and activity are fictional Nessie demo records. Users can still ask questions and make corrections in natural language.

A clear affirmative such as “good”, “yes”, “yep”, or “sure” confirms the current checkbox selections, accepts a single displayed address correction, or submits an unchanged displayed profile review, without another model confirmation. Spending categories require at least one selection; an empty list gets a friendly prompt instead of invented preferences. Questions, negations, conditional approvals, corrections, and stale reviews do not submit. Selecting an address or accounts is never final profile approval.

Each selected account gets exactly 100 transactions (50 deposits/payments and 50 withdrawals/purchases over 90 days), with six recent pending entries, five green and five non-green illustrative purchases, two unusual large purchases, and two deliberate duplicate pairs. Environmental labels apply only to the controlled demo merchant examples; they are not measured carbon footprints. Each account also gets three recurring sample bills and one sample loan through Nessie’s account bill/loan POST endpoints. Existing dashboard and chat APIs read those saved Nessie records. If Nessie’s customer-wide bill list fails validation, the read-only client aggregates bill records from that customer’s own account endpoints instead. Unchecking all accounts creates a customer with an empty dashboard. Failed or uncertain writes are reported without automatic retries. The chat agent’s existing Nessie tools remain read-only; signup uses dedicated server endpoints.

Every new account includes two suspicious purchases, with merchants, amounts ($1,200–$2,200), and dates varied using the account ID. Examples span gas stations, restaurants, coffee shops, cinemas, bookstores, pharmacies, transit, and groceries, with ordinary charges at the same merchants for comparison. Outlier detection checks merchant-specific spikes even when a merchant recurs across months, while leaving steady recurring bills alone. These findings indicate purchases to review, not proof of fraud. Existing histories are retained; the updated examples apply to newly created accounts.

CreditWise displays a fictional score from 300–850, pseudorandomly seeded by the Nessie customer ID so it stays consistent across reloads. The rating, ring color (red through green), and filled arc follow the score. This demo score is separate from Nessie loan records.

Sign-in and dashboard/chat profile dropdowns offer a trash icon for every profile except Maya Chen and Demo Tester, with the same protection enforced on the server. Nessie has no customer DELETE endpoint, so removal persists a reversible name marker and hides that profile from the demo without deleting its financial records. Undo restores the original name and visibility; the browser retains Undo history across reloads. Removing the selected profile ends its sessions and switches to another available profile.

Generated checking/savings balances equal completed deposits minus completed withdrawals. Demo points equal one point per whole dollar of completed withdrawals; this is a demo rule, not a real product rewards policy. Credit card balances owed equal completed purchases minus completed payments, with one demo point per whole dollar of purchases. Their ordinary sample merchants follow the selected spending priorities. Pending/cancelled entries stay visible in history but do not earn points, change posted running balances, or enter posted spending/cashflow/anomaly calculations. Both totals are saved when creating the Nessie account. Because Nessie does not update its account metadata as transaction records are added, reads reconcile generated accounts (identified by their nickname and `DEMO OPENING DEPOSIT` or `DEMO OPENING PURCHASE` marker) against their actual stored history, including accounts created before this calculation was added.

Address autocomplete uses [Photon/OpenStreetMap](https://github.com/komoot/photon/blob/master/docs/api-v1.md) with a debounced server proxy. Complete addresses are checked with the [US Census geocoder](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html) before any customer/account writes. Changes to the street, city, or ZIP require the user to choose a correction. A street-address geocoding match is not proof of residence or postal/unit deliverability; apartment details are preserved but not verified. Address-provider outages keep the conversation intact and block profile creation until a check succeeds. No extra API key is needed for these demo lookups.

Onboarding drafts stay in the current browser tab’s session storage until completion. The optional voice toggle uses browser text-to-speech. Run `npm run test:e2e -- e2e/landing.spec.ts e2e/signup.spec.ts` against the dev server on port 5184 for the landing and sign-up browser checks.

## Deploy to Cloudflare Workers

```sh
npx wrangler login
npm run deploy
```

The Worker name is set to `eno2` in `wrangler.jsonc`. Change it there if you want a different deployment name.
