# eno2

A TypeScript SvelteKit starter for Cloudflare Workers. The Cloudflare adapter bundles server-rendered routes and static assets for Wrangler.

## Local development

Use Node.js 22.12+ on the 22.x line, or Node.js 24+.

```sh
npm ci
npm run dev
```

Edit `src/routes/+page.svelte` to change the home page. Run `npm run check` to check Svelte and TypeScript. Run `npm run preview` to build and serve the app locally in the Workers runtime. Wrangler prints the URL.

The home page links to `/setup`, a conversational onboarding flow powered by the configured Gemini model. Eno collects only the name and mailing address required by Nessie; no email is requested. After those details, a spending-category checklist appears in the chat. The first selected category is the top priority: travel → [Capital One Venture](https://www.capitalone.com/credit-cards/venture/); dining/groceries/entertainment → [Capital One Savor](https://www.capitalone.com/credit-cards/savor/); other everyday spending → [Capital One Quicksilver](https://www.capitalone.com/credit-cards/quicksilver/). The next checklist starts with checking, savings, and the matching credit card checked. Users can uncheck any option, including all three, before the final profile review. Product names are real, but the accounts, rewards, loans, and activity are fictional Nessie demo records. Users can still ask questions and make corrections in natural language.

A clear affirmative such as “good”, “yes”, “yep”, or “sure” confirms the current checkbox selections, accepts a single displayed address correction, or submits an unchanged displayed profile review, without another model confirmation. Spending categories require at least one selection; an empty list gets a friendly prompt instead of invented preferences. Questions, negations, conditional approvals, corrections, and stale reviews do not submit. Selecting an address or accounts is never final profile approval.

Each selected account gets exactly 100 transactions (50 deposits/payments and 50 withdrawals/purchases over 90 days), with six recent pending entries, five green and five non-green illustrative purchases, two unusual large purchases, and two deliberate duplicate pairs. Environmental labels apply only to the controlled demo merchant examples; they are not measured carbon footprints. Each account also gets three recurring sample bills and one sample loan through Nessie’s account bill/loan POST endpoints. Existing dashboard and chat APIs read those saved Nessie records. If Nessie’s customer-wide bill list fails validation, the read-only client aggregates bill records from that customer’s own account endpoints instead. Unchecking all accounts creates a customer with an empty dashboard. Failed or uncertain writes are reported without automatic retries. The chat agent’s existing Nessie tools remain read-only; signup uses dedicated server endpoints.

Every new account includes two suspicious purchases, with merchants, amounts, and dates varied using the account ID. Their amounts sit $25–$75 above the merchant-specific detection threshold instead of using a fixed four-figure range, keeping them detectable without overwhelming the spend-based ClimateWise estimate. About 30% of account histories include one oversized gas-station purchase, capped at $350 by its ordinary $30–$65 comparison purchases. Ordinary credit-card fuel purchases also use that $30–$65 range, with correspondingly smaller sample payments. The remaining suspicious examples use restaurants, coffee shops, cinemas, bookstores, pharmacies, transit, and groceries. Outlier detection checks merchant-specific spikes even when a merchant recurs across months, while leaving steady recurring bills alone. These findings indicate purchases to review, not proof of fraud. Existing histories are retained; the updated examples apply to newly created accounts.

Chat gives every displayed suspicious charge a grounded reason, including when a model reply only lists merchants. Duplicate explanations identify repeated same-merchant/same-amount charges within three days; unusually large purchases use the account or merchant baseline supplied by the detector. Bill cards follow the complete paragraph or list item discussing that bill and remain buffered while that context is still streaming.

CreditWise displays a fictional score from 300–850, pseudorandomly seeded by the Nessie customer ID so it stays consistent across reloads. Maya Chen’s demo score stays at 762. The rating, ring color (red through green), and filled arc follow the score. This demo score is separate from Nessie loan records.

Sign-in and dashboard/chat profile dropdowns share the same presentation, with Maya Chen followed by Demo Tester pinned above the other profiles. Switching profiles updates the customer URL and remembers the selection in the browser, preserving it across refreshes even if the server session expires. Explicit customer links take precedence over the remembered selection; a removed profile falls back to an available one.

Both dropdowns use a single row template with matching arrows, loading/error states, and retry controls. Neither shows trash icons or profile-removal notices. Nessie removal markers retain the original name and financial records, and Maya Chen and Demo Tester remain protected by the removal API.

Generated checking/savings balances equal completed deposits minus completed withdrawals. Demo points equal one point per whole dollar of completed withdrawals; this is a demo rule, not a real product rewards policy. Credit card balances owed equal completed purchases minus completed payments, with one demo point per whole dollar of purchases. Their ordinary sample merchants follow the selected spending priorities. Pending/cancelled entries stay visible in history but do not earn points, change posted running balances, or enter posted spending/cashflow/anomaly calculations. Both totals are saved when creating the Nessie account. Because Nessie does not update its account metadata as transaction records are added, reads reconcile generated accounts (identified by their nickname and `DEMO OPENING DEPOSIT` or `DEMO OPENING PURCHASE` marker) against their actual stored history, including accounts created before this calculation was added.

Address autocomplete uses [Photon/OpenStreetMap](https://github.com/komoot/photon/blob/master/docs/api-v1.md) with a debounced server proxy. Complete addresses are checked with the [US Census geocoder](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html) before any customer/account writes. Changes to the street, city, or ZIP require the user to choose a correction. A street-address geocoding match is not proof of residence or postal/unit deliverability; apartment details are preserved but not verified. Address-provider outages keep the conversation intact and block profile creation until a check succeeds. No extra API key is needed for these demo lookups.

Signup stays on personal details while an address is incomplete, unmatched, unavailable, or awaiting the user's confirmation. The server does not advance its stage or accept stale checklist submissions in those states. The client also hides later checklists and review controls, including after restoring a draft; only the current unanswered checklist is interactive and visible.

Onboarding drafts stay in the current browser tab’s session storage until completion. The optional voice toggle uses browser text-to-speech. Run `npm run test:e2e -- e2e/landing.spec.ts e2e/signup.spec.ts` against the dev server on port 5184 for the landing and sign-up browser checks.

## Deploy to Cloudflare Workers

```sh
npx wrangler login
npm run deploy
```

The Worker name is set to `eno2` in `wrangler.jsonc`. Change it there if you want a different deployment name.
