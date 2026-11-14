# eno2

A TypeScript SvelteKit starter for Cloudflare Workers. The Cloudflare adapter bundles server-rendered routes and static assets for Wrangler.

## Local development

Use Node.js 22.12+ on the 22.x line, or Node.js 24+.

```sh
npm ci
npm run dev
```

Edit `src/routes/+page.svelte` to change the home page. Run `npm run check` to check Svelte and TypeScript. Run `npm run preview` to build and serve the app locally in the Workers runtime. Wrangler prints the URL.

The home page links to `/signup`, a conversational onboarding flow powered by the configured Gemini model. Eno collects the name and address required by Nessie, answers questions along the way, and offers checking, savings, both, or no accounts. A reviewed, confirmed submission creates the Nessie customer and only the selected demo accounts. Each selected account gets 100 sample transactions (50 deposits and 50 withdrawals over the last 90 days), saved in Nessie and loaded by the existing dashboard APIs. Selecting no accounts opens a fresh dashboard. The chat agent’s existing Nessie tools remain read-only; sign-up uses dedicated server endpoints.

Onboarding drafts stay in the current browser tab’s session storage until completion. The optional voice toggle uses browser text-to-speech. Run `npm run test:e2e -- e2e/landing.spec.ts e2e/signup.spec.ts` against the dev server on port 5184 for the landing and sign-up browser checks.

## Deploy to Cloudflare Workers

```sh
npx wrangler login
npm run deploy
```

The Worker name is set to `eno2` in `wrangler.jsonc`. Change it there if you want a different deployment name.
