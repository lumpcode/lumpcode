# Publishing `@lumpcode/*` and `lumpcode` to npm (operators)

Contributor and operator only notes for publishing from the monorepo. End users install via `npm i -g @lumpcode/cli` (see [README](../README.md)).

## Bump versions

Align all four publishable packages and workspace `@lumpcode/core` / `@lumpcode/cli` deps:

```bash
node scripts/set-npm-versions.mjs 0.0.1
node scripts/set-npm-versions.mjs --patch
```

Runs `npm install` at the repo root by default (pass `--no-install` to skip).

## Packages and order

Publish in dependency order:

1. `@lumpcode/core`
2. `@lumpcode/cli-types`
3. `@lumpcode/cli`
4. `lumpcode` (`packages/apps/cli-meta` — unscoped global install alias)

Each `package.json` includes `publishConfig.access: public` for the first scoped public publish under the `lumpcode` org. The unscoped `lumpcode` package is public by default.

## Pre-publish verification

From the monorepo root:

```bash
export ENV=prod

npm run build -w=@lumpcode/core
npm run build -w=@lumpcode/cli-types
npm run build:bundle -w=@lumpcode/cli

npm run test -w=@lumpcode/core
npm run test -w=@lumpcode/cli
npm run test:e2e -w=@lumpcode/cli
npm run test:e2e:node -w=@lumpcode/cli

npm pack -w=@lumpcode/core
npm pack -w=@lumpcode/cli-types
npm pack -w=@lumpcode/cli
npm pack -w=lumpcode
```

Inspect tarballs: `dist/`, CLI `bin/`, `postinstall` scripts, `LICENSE`, README. The `lumpcode` tarball should contain only `bin/lumpcode.js` plus metadata and depend on `@lumpcode/cli`.

Or use the helper script (build + publish):

```bash
node scripts/publish-npm.mjs --dry-run   # build + pack only
node scripts/publish-npm.mjs             # build + publish (latest); skips packages whose version is already on npm
```

## Publish (`latest` tag)

`npm publish` without `--tag` sets the `latest` dist-tag. Plain `npm i lumpcode` and `npm i @lumpcode/cli` resolve to it.

```bash
npm login
npm whoami

npm publish -w=@lumpcode/core --access public
npm publish -w=@lumpcode/cli-types --access public
npm publish -w=@lumpcode/cli --access public
npm publish -w=lumpcode
```

Users install:

```bash
npm i -g @lumpcode/cli
npm i -D @lumpcode/cli-types
```

(`lumpcode` on npm is an unpublished-from-docs alias package — same CLI; publish it for `npm i -g lumpcode` without documenting that path yet.)

`npm update -g @lumpcode/cli` picks up new `latest` releases after you bump the version and publish again.

## Remove a stale `beta` dist-tag

If packages were previously published with `--tag beta` and you no longer want that tag:

```bash
npm dist-tag rm @lumpcode/core beta
npm dist-tag rm @lumpcode/cli-types beta
npm dist-tag rm @lumpcode/cli beta
npm dist-tag rm lumpcode beta
```

## Notes

- `repository` in `package.json` is omitted (not required for publish).
- CLI `postinstall` binary download uses `native-binary.mjs` / `LUMPCODE_INSTALL_REPO`, separate from npm metadata.
- `prepublishOnly` runs builds: `core` and `cli-types` → `npm run build`; `cli` → `npm run build:bundle`; `lumpcode` has no build step.
- Root monorepo package name is `lumpcode-monorepo` (private, not published) so the npm name `lumpcode` is reserved for `cli-meta`.
