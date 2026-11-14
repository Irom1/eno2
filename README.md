# eno2

A TypeScript SvelteKit starter for Cloudflare Workers. The Cloudflare adapter bundles server-rendered routes and static assets for Wrangler.

## Local development

Use Node.js 22.12+ on the 22.x line, or Node.js 24+.

```sh
npm ci
npm run dev
```

Edit `src/routes/+page.svelte` to change the home page. Run `npm run check` to check Svelte and TypeScript. Run `npm run preview` to build and serve the app locally in the Workers runtime. Wrangler prints the URL.

## Deploy to Cloudflare Workers

```sh
npx wrangler login
npm run deploy
```

The Worker name is set to `eno2` in `wrangler.jsonc`. Change it there if you want a different deployment name.
