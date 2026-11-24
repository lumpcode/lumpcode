# Learnings

## Expected

`desc.yml` (`workflow: [manualReq, impl]`, no `dependsOn`) asks for a landing **Copy setup prompt** that copies a runbook. The runbook installs the CLI and skill, asks the blocking questions, writes `.lumpcode/templates/main.ts` exporting `defineLump` (command, model, worktree prep, optional `openPrPostTeardown`), proves the path with a temporary smoke lump, then writes a real first lump wrapped in `retryUntilGreen`, validates with `lump-plan`, clones a sibling dedicated worker, runs the real lump, removes the smoke, and starts the worker. The same markdown is served at `/install-prompt.md`. The `lumpcode` skill gets the `defineLump` and `retryUntilGreen` examples.

`requirements.md` is the decided plan: the `#install` CTA, `packages/apps/website/app/assets/install-prompt.md`, SEO output, the gitignore entry, and the skill section. No CLI, core, or recipes code changes. This item has no `testPlan.md` or `expect.yml`.

## Landed

No marker commit yet. This working tree is the landing.

- `packages/apps/website/app/assets/install-prompt.md` — the runbook and the copy source. It also tells the agent to install `@lumpcode/cli-utils` and `@lumpcode/recipes` so the template can load, and to use `npm install` when `package.json` exists and there is no lockfile.
- `packages/apps/website/app/pages/index.vue` — primary button, caption, polite status, and the **Or do it yourself** divider above the existing snippets.
- `packages/apps/website/app/assets/css/main.css` — stable button width, caption, divider, and the hidden live region, using existing tokens. Not in the deliverable table; the CTA needs it.
- `packages/apps/website/seo/generateSeoFiles.ts` — writes `public/install-prompt.md`, the `_headers` markdown rule with no canonical link, and the `llms.txt` Optional link. No sitemap entry.
- `packages/apps/website/.gitignore` — ignores `public/install-prompt.md`.
- `.agents/skills/lumpcode/SKILL.md` — `A shared defineLump for your repo`, the `retryUntilGreen` lump example, and `Propose validation`. The one-context-source, one-prompt, and `lump-plan` rules stay.
- `packages/apps/website/package.json`, `packages/apps/website/vitest.config.ts`, `packages/apps/website/seo/installPrompt.unit.test.ts`, `packages/apps/website/seo/installPromptDryRun.unit.test.ts` — tests requested for this stage. Not in the deliverable table. The dry run builds `defineLump` from the runbook, checks the worktree hook makes no git change, and gets a green `lump-plan --contexts --prompts` for the smoke (one context, no `retryUntilGreen`) and the real lump (`npm test`).
