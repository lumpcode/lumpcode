# Remove uncalled `docsItemByPath` from the website docs nav

Removed `docsItemByPath` from `packages/apps/website/app/utils/docsNav.ts`. It returned the nav item for a path. Nothing on the website calls it anymore. The website is private, so this is not published surface. Sidebar, pager, redirects, and page loading still use `docsNav`, `docsSectionTitle`, `docsNeighbors`, `docsRedirectTarget`, and `isDocsNavActive`. No page output changes.

## Why it is unused

- `rg --hidden -w docsItemByPath` across the repo (excluding `node_modules`, `.git`, `dist`, `.nuxt`, and `.output`) matched only the definition and the previous trimmer note. That search covers `.vue` templates. Nuxt auto-imports `app/utils/`, so a component could call it without an `import` line. None does.
- `nuxt.config.ts` imports `docsPrerenderRoutes` and `docsRedirects` only. `loadDocs.ts` imports `docsSectionTitle` and `withoutTrailingSlash`. Neither file builds the name from a string or uses a dynamic import.
- `git log -S docsItemByPath` shows it was added in `c97fbef`, where `loadDocs.ts` called it while indexing vue pages. `9872731` removed that caller and switched the import to `docsSectionTitle`. `c094f80a` only taught the leftover function to strip a trailing slash. No later commit added a caller.

## Checks

- `@lumpcode/website` has no `test` script. `npm run typecheck -w=@lumpcode/website` (`nuxt typecheck`) passed. A temporary `number` assigned from a string in `docsNav.ts` failed that typecheck with TS2322, and I then deleted the probe.
- `npm run build`: passed. All 6 tasks came from cache, because the website is outside that script.
