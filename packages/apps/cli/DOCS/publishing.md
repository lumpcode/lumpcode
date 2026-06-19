# Publishing `@lumpcode/*` to npm (operators)

Contributor and operator only notes for publishing from the monorepo. End users install via `npm i -g @lumpcode/cli` (see [README](../README.md)).

## Bump versions

Align all three publishable packages and workspace `@lumpcode/core` deps:

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

Each `package.json` includes `publishConfig.access: public` for the first scoped public publish under the `lumpcode` org.

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
```

Inspect tarballs: `dist/`, CLI `bin/`, `postinstall` scripts, `LICENSE`, README.

Or use the helper script (build + publish):

```bash
node scripts/publish-npm.mjs --dry-run   # build + pack only
node scripts/publish-npm.mjs             # build + publish (latest)
```

## Publish (`latest` tag)

`npm publish` without `--tag` sets the `latest` dist-tag. Plain `npm i @lumpcode/cli` resolves to it.

```bash
npm login
npm whoami

npm publish -w=@lumpcode/core --access public
npm publish -w=@lumpcode/cli-types --access public
npm publish -w=@lumpcode/cli --access public
```

Users install:

```bash
npm i -g @lumpcode/cli
npm i -D @lumpcode/cli-types
```

`npm update -g @lumpcode/cli` picks up new `latest` releases after you bump the version and publish again.

## Remove a stale `beta` dist-tag

If packages were previously published with `--tag beta` and you no longer want that tag:

```bash
npm dist-tag rm @lumpcode/core beta
npm dist-tag rm @lumpcode/cli-types beta
npm dist-tag rm @lumpcode/cli beta
```

## Notes

- `repository` in `package.json` is omitted (not required for publish).
- CLI `postinstall` binary download uses `native-binary.mjs` / `LUMPCODE_INSTALL_REPO`, separate from npm metadata.
- `prepublishOnly` runs builds: `core` and `cli-types` → `npm run build`; `cli` → `npm run build:bundle`.
