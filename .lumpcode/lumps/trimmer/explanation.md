# Remove uncalled `listDocPages` from the website docs loader

Removed `listDocPages` from `packages/apps/website/app/utils/loadDocs.ts`. It returned every loaded docs page as an array, and nothing on the website calls it. It came in with the website docs (`c97fbef`) and has never had a caller. `getDocPage` still reads the same `docsByPath` map, and `DocPage` is still its return type, so neither goes away. The website is private, so this is not published surface. No page output changes.

## Why it is unused

- `rg --hidden -w listDocPages` across the repo (excluding `node_modules` and `dist`) matched only the definition. That search covers `.vue` templates, which matters because Nuxt auto-imports everything in `app/utils/`, so a component could call it without an `import` line. None does.
- `loadDocs` itself is reached only through that auto-import, and `nuxt.config.ts` imports `./app/utils/docsNav`, not `loadDocs`. Neither file builds a call from a string or uses a dynamic import.
- `git log -S listDocPages` shows only the commit that added it and a later docs cleanup, which touched nearby lines but left the function as it was.

## Checks

- The website has no `test` script. Instead I ran `npm run typecheck -w=@lumpcode/website` (`nuxt typecheck`), which passed. To confirm it covers this file, I added a temporary `app/utils` module that imported `listDocPages`. The typecheck failed with TS2305, as expected, and I then deleted the probe.
- `npm run generate` in `packages/apps/website`: passed, and 56 routes were prerendered, including every `/docs/*` page.
- `npm run build`: passed. All 6 tasks came from cache, because the website is outside that script.

A follow-up candidate: `docsItemByPath` in `packages/apps/website/app/utils/docsNav.ts` came in with the same commit and also has no callers.
