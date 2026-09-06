# Lumpcode website

Public marketing site for [Lumpcode](https://github.com/lumpcode/lumpcode). Nuxt 4, Vue 3, Vite, TypeScript. Does not use `@lumpcode/ui`.

```bash
npm run website
```

From this package: `npm run dev` (http://localhost:3000), `npm run generate` for a static build, `npm run preview` to serve it, `npm run deploy` to generate and upload to Cloudflare Pages (`lumpcode`). From the repo root: `npm run website:deploy`.

Pushes to `main` that touch this package, the published `lumpConfig.schema.json` / `daemonConfig.schema.json`, or `.github/workflows/deploy-website.yml` run that deploy automatically. Add repository secrets `CLOUDFLARE_API_TOKEN` (Account / Cloudflare Pages / Edit) and `CLOUDFLARE_ACCOUNT_ID`. Use **Actions → Deploy website → Run workflow** for a manual deploy.

If a fresh monorepo install fails resolving Nuxt peers, retry from the repo root with `npm install --legacy-peer-deps`. Copy lives in `app/utils/site.ts`. Operator docs are rewritten markdown in `content/docs/` nested by section (`/docs/start/…`, `/docs/author/…`, `/docs/config/…`, `/docs/reference/…`). Overview is `/docs/start/overview` (`/docs` 301s there). Tutorials: `/docs/start/first-pr` and `/docs/start/worker`. Logos in `public/` are the no-mouth mark and lockup from `assets/`.
