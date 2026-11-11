---
name: bug-hunter
description: >-
  Review the codebase, run tests, and file 1 to 5 bugs as bugfixes backlog
  items. Use when the bugHunter lump runs. Does not fix the bugs.
disable-model-invocation: true
---

# Bug hunter

Find real bugs and file them. The `bugfixes` lump implements them after this pull request merges. You do not fix the product in this run.

## What counts

A bug is behavior that contradicts the docs, the requirements of a shipped feature, or an invariant the code itself enforces, and that you can show.

Show it with a failing test you ran, or with a short repro (command, input, actual, expected). A style nit, a missing feature, an unused export, and a wording tweak are other lumps' work. Leave them.

Look through `packages/core`, `packages/recipes`, `packages/apps/cli`, and the tests next to them. Run the test script of the package you are inspecting (`npm run test -w=<package>`). A red test is a lead only when the failure is a product bug. A broken test harness is a bug if the harness is wrong; a failing assertion that matches the docs is a broken test, which you may file.

## What one run writes

1 to 5 items, under `.lumpcode/lumps/bugfixes/backlogItems/todo/<name>/`.

Stop at fewer when you cannot show another bug. The lane stays at or below 5 todo folders that contain `desc.yml`, counting folders that already exist.

Each item:

```yaml
# yaml-language-server: $schema=https://lumpcode.com/schemas/featureBacklogDesc.schema.json
name: kebab-name
workflow:
  - impl
task: >-
  One sentence: what is wrong and where.
priority: 20
```

`name` matches the folder, matches `^[a-zA-Z0-9_-]+$`, and does not end in `_req`, `_testPlan`, or `_testImpl`. Do not reuse the name of an open or completed bugfixes item.

`requirements.md` uses the headings in `.agents/skills/write-requirements/SKILL.md`. Include the repro, the expected behavior, and the actual behavior. Name the owning module. Do not paste a patch. Priority 20 or higher, unless you are filing something that blocks the worker from running at all, in which case use 5.

`workflow` is exactly `[impl]`. Top-level folders only, no `tickets/` children, so the bugfixes lump picks the item up on `dev` after this pull request merges.

## Bounds

Do not edit product source, tests, docs, or `IDEAS.yaml`. Do not delete an existing bugfixes todo. Test output and scratch files stay untracked.

When you cannot show a single bug, write `.lumpcode/lumps/bugHunter/skipped.md` with the commands you ran and what you looked at, and stop.
