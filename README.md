# eno2

A TypeScript SvelteKit starter for Cloudflare Workers. The Cloudflare adapter bundles server-rendered routes and static assets for Wrangler.

## Local development

Use Node.js 22.12+ on the 22.x line, or Node.js 24+.

```sh
npm ci
npm run dev
```

Edit `src/routes/+page.svelte` to change the home page. Run `npm run check` to check Svelte and TypeScript. Run `npm run preview` to build and serve the app locally in the Workers runtime. Wrangler prints the URL.

The home page links to `/signup`, a conversational onboarding flow powered by the configured Gemini model. Eno collects the name and address required by Nessie, answers questions along the way, and offers checking, savings, both, or no accounts. After that choice, Eno asks which spending categories matter most. The first stated priority selects a demo theme: travel → Venture; dining/groceries/entertainment → Savor; other everyday spending → Quicksilver. Users can change priorities or skip a credit card. These themes follow the [Capital One product categories](https://www.capitalone.com/credit-cards/compare/), but simulated points are not real product terms. The final review includes the matched card. A reviewed, confirmed submission creates the Nessie customer and only the selected demo accounts. Each selected account gets 100 sample transactions (50 deposits/payments and 50 withdrawals/purchases over the last 90 days), saved in Nessie and loaded by the existing dashboard APIs. Skipping both deposit accounts and the demo credit card opens a fresh dashboard. The chat agent’s existing Nessie tools remain read-only; sign-up uses dedicated server endpoints.

Generated checking/savings balances equal completed deposits minus completed withdrawals. Demo points equal one point per whole dollar of completed withdrawals; this is a demo rule, not a real product rewards policy. Credit card balances owed equal completed purchases minus completed payments, with one demo point per whole dollar of purchases. Their sample merchants follow the selected spending priorities. Both totals are saved when creating the Nessie account. Because Nessie does not update its account metadata as transaction records are added, reads reconcile generated accounts (identified by their nickname and `DEMO OPENING DEPOSIT` or `DEMO OPENING PURCHASE` marker) against their actual stored history, including accounts created before this calculation was added.

Address autocomplete uses [Photon/OpenStreetMap](https://github.com/komoot/photon/blob/master/docs/api-v1.md) with a debounced server proxy. Complete addresses are checked with the [US Census geocoder](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html) before any customer/account writes. Changes to the street, city, or ZIP require the user to choose a correction. A street-address geocoding match is not proof of residence or postal/unit deliverability; apartment details are preserved but not verified. Address-provider outages keep the conversation intact and block profile creation until a check succeeds. No extra API key is needed for these demo lookups.

Onboarding drafts stay in the current browser tab’s session storage until completion. The optional voice toggle uses browser text-to-speech. Run `npm run test:e2e -- e2e/landing.spec.ts e2e/signup.spec.ts` against the dev server on port 5184 for the landing and sign-up browser checks.

## Deploy to Cloudflare Workers

```sh
npx wrangler login
npm run deploy
```

The Worker name is set to `eno2` in `wrangler.jsonc`. Change it there if you want a different deployment name.
