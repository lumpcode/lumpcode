# Remove uncalled `expectCliFailureEnvelope` from the CLI e2e harness

Removed `expectCliFailureEnvelope` from `packages/apps/cli/src/e2e/harness/e2eCli.ts`. It asserted that a `--json` run exited non-zero with a `success: false` envelope, but no e2e spec calls it. `tail` and `RunCliResult` stay imported because `expectCliOk` still uses them. Test behavior does not change.

## Why it is unused

- `rg --hidden expectCliFailureEnvelope` across the repo (excluding `node_modules`, `.git`, and `dist`, substring rather than whole-word) matches only its own definition and the previous trimmer note, which listed it as a follow-up candidate. No test, docs, `.lumpcode/`, or `.agents/` file references it.
- `e2e/harness/index.ts` re-exports `e2eCli` with `export *`, but the same search finds no import of the name through the barrel.
- `rg 'import\('` under `packages/apps/cli/src/e2e/` finds no dynamic imports.
- The harness is not published. Both CLI tsconfigs exclude `src/e2e/**`, and the package ships only the bin, the ncc bundle, schemas, presets, and install scripts.

## Checks

- `npm run build`: passed.
- `npm run test -w=@lumpcode/cli`: 166 files and 1263 tests passed, no type errors. On the first run, `sparseCronCatchUp.unit.test.ts` ("retries a lock wait timeout once the retry delay elapses") failed with "expected 2 runs, got 1". It passed twice in isolation and in a full rerun, so it is a timing flake under load. It does not touch the e2e harness.

## Follow-up candidates (not touched)

These are still definition-only in the harness: `commitAndPushMain` in `createE2eProject.ts` and `inlineE2eMockAgentCommandFn` in `createE2eAgentCommandModule.ts`.
