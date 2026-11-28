# Learnings

## Expected
`desc.yml` (`workflow: [manualReq, testImpl, impl]`, depends on `config-and-plan`): workflow kit helpers in `@lumpcode/recipes` with the plain names `retryUntilGreen` (`{ session, shell, check }`), `requireArtifact`, and `mustSucceed`. Today's `retryUntilGreen` becomes `retryUntilGreenSteps` with no alias. `openPrPostTeardown` builds its default body from context messages and opens a draft when a pushed context did not succeed (`draftOnFailure`).

`requirements.md`: unit tests in `kit/workflow/*.unit.test.ts` (green first try, green after fixes, out of attempts, fix prompt text, abort, `requireArtifact` on a real temp dir, `mustSucceed` message), today's `retryUntilGreen` tests renamed onto `retryUntilGreenSteps`, `openPrPostTeardown/unit.test.ts` for each body/draft row and `--draft` in the `gh` argv, a kit types test (`retryUntilGreen({ steps })` is a type error, `retryUntilGreenSteps({ steps })` type-checks), and `lump-plan` for every lump under `.lumpcode/lumps/`. Packages are `@lumpcode/recipes`; core and the CLI stay unchanged. No `testPlan.md` or `expect.yml` on this item or the parent. The parent `requirements.md` is the contract. This stage writes skipped tests and does not create `testPlan.md`.

## Landed
Working tree only. The marker commit for this stage does not exist yet.

Skipped tests:
- `packages/recipes/src/kit/workflow/retryUntilGreen.unit.test.ts`
- `packages/recipes/src/kit/workflow/requireArtifact.unit.test.ts`
- `packages/recipes/src/kit/workflow/mustSucceed.unit.test.ts`
- `packages/recipes/src/kit/workflow/kit.types.test.ts`
- `packages/recipes/src/kit/openPrPostTeardown/unit.test.ts` (`openPrPostTeardown context results`). The existing cases in that file stay live.
- `packages/apps/cli/src/commands/lump-plan/repoLumps.unit.test.ts`

Today's steps loop tests stay live, renamed to `retryUntilGreenSteps`, in `packages/recipes/src/kit/getValidationLoopSteps.unit.test.ts`.

So the skipped suites import and the repo still typechecks, this stage also moves the steps helper to `retryUntilGreenSteps` (no alias), adds throwing `not implemented` workflow stubs, and points in-repo steps callers at the new name:
- `packages/recipes/src/kit/retryUntilGreenSteps.ts` (was `retryUntilGreen.ts`)
- `packages/recipes/src/kit/workflow/retryUntilGreen.ts`, `requireArtifact.ts`, `mustSucceed.ts`
- `packages/recipes/src/kit/index.ts`
- `packages/recipes/src/kit/openPrPostTeardown/main.ts` (`draftOnFailure` on the options type)
- `packages/recipes/src/recipes/featureBacklog/main.ts`, `abstractionBacklog/main.ts`
- `.lumpcode/lumps/{autoTriage,polisher,writer,trimmer}/config.ts`
- `.agents/skills/lumpcode/assets/lumps/{coverage-sweep,retry-until-green}/config.ts`
- `packages/apps/website/seo/installPromptDryRun.unit.test.ts` (the fixture config it plans)

## Gap
The workflow helpers throw `not implemented`. `openPrPostTeardown` still opens a normal PR whose default body is `LUMP contexts: <names>`. Docs, the changelog, the website snippets, and the install prompt still show `retryUntilGreen({ steps })`.

## Adjustments
`attempts` on the `retryUntilGreen` result is how many times the check ran. `maxAttempts` is fix attempts after the first check (default 3, so a check that stays red runs 4 times and prompts 3 fixes). The fix prompt's `attempt` is 1-based. Labels are `retry: <check>` and `retry fix <attempt>/<maxAttempts>`. The default fix prompt text matches today's steps prompt, including an empty output string. `maxAttempts: 0` checks once and does not prompt. A red result returns; a throw, including `AbortError`, propagates.

`requireArtifact` checks `path.join(workspacePath, path)`. A file that is already there returns `{ succeeded: true, path }` with no prompt. Otherwise it prompts at most `maxAttempts` times (default 2) and returns the relative `path`. The default prompt is `Write <path>. It is missing.`

`mustSucceed` returns the same result when `succeeded` is true. Otherwise it throws `Error` with `cause` set to the result. The message starts with the `message` argument, or contains `failed` when that argument is omitted, and ends with the last 2,000 characters of `output`.

A pushed context is `outcome === 'pushed'`. Only those contribute a message, and only a non-empty message. An empty message is omitted. `succeeded: false` on a pushed context drafts the PR (`gh pr create --draft`, flag immediately after `create`) unless `draftOnFailure` is false. The default title and the `LUMP contexts:` fallback still use the context-list names. `title` and `body` overrides receive `contextResults` and still draft when a pushed context failed.
