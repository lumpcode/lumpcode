# Learnings

## Expected
`desc.yml`: `makeGetContextListFnFromTemplate` emits a `contextListJson` path-pattern context as soon as any one key matches, so a folder missing its test still runs and the prompt keeps a literal `@{TEST}`. Emit a context only when every placeholder key matched. Workflow: `impl`. No `dependsOn`.

`requirements.md`: in `makeGetContextListFnFromTemplate` only, after the scan and before `contextOptionsFn`, drop a context that lacks any key whose pattern contains a placeholder. Keys with no placeholder still never match and are not required. Capture syntax, modifiers, the `-` join, ordering, the array form, `contextMatchFn`, and `getContextListFn` stay. Callers do not add their own filter. Tests: the UserCard / DataTable repro returns only `UserCard` with both variables, and `contextOptionsFn` is not called for `DataTable`. Existing cases in the same file stay. No `testPlan.md` or `expect.yml`.

## Landed
Working tree only. No marker commit yet.

- `packages/apps/cli/src/utils/makeGetContextListFnFromTemplate/main.ts`: placeholder-bearing keys are required. A scanned context missing any of them is dropped before `contextOptionsFn`.
- `packages/apps/cli/src/utils/makeGetContextListFnFromTemplate/unit.test.ts`: the repro returns only `UserCard`, and a `contextOptionsFn` spy is called once, for `UserCard`.
- `learnings.md` (this file).

`npm run build -w=@lumpcode/cli` and `npm run test -w=@lumpcode/cli` passed (1263 tests).
