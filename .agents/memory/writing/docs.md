# Docs and vocabulary

How README, `packages/apps/cli/DOCS/`, schemas, and skills talk about Lumpcode.

- Keep user-facing docs (`README`, `DOCS/`) aligned with real CLI behavior; avoid internal implementation detail unless an operator truly needs it. Position Lumpcode as **the simplest way to set up software factories in your repo** (root/CLI README intros, npm description, GitHub About); a **lump** is one software factory. **Loop engineering** stays in `DOCS/start/terms.md` and as the `loop-engineering` npm keyword on cli/core/cli-types, not in README intros
- Publishable package READMEs (`@lumpcode/recipes`, `@lumpcode/cli-utils`, …) are operator-facing: no "private monorepo" or "Published …" status framing; point to `@lumpcode/cli` as the main install when the package is an add-on
- **Lump**: a software factory living in the repo (`.lumpcode/lumps/`, `lumpcode run`), defined in code the user commits; technically a long-running agent loop campaign over a body of work too big for one chat — both repetitive edits (migrations, codemods) **and** planned feature roadmaps; avoid "set up once" framing (project setup is followed by recurring per-lump authoring)
- **LUMP** backronym: Loop Using Multiple Prompts
- Human review via **PR merge**, not vague "human review"
- Three workspace terms: **project workspace** (`projectRoot`), **execution workspace** (`executionWorkspacePath`; git repo root after pre-flight), **branch workspace** (`workspacePath` on core `CommandFn` / `SetupWorkspaceFn` return — agent + per-context git cwd)
- Tutorials (e.g. `DOCS/start/first-pr.md`) must be **self-contained**; links are optional depth only
- Docs intros are user-facing — definitions go in **Core terms** (`DOCS/start/terms.md`), not writer-only Terminology sections
- Prefer periods/commas over em dashes in README/DOCS when not necessary
- Document cross-lump **`dependsOnContexts`** in CLI DOCS only (`<otherLumpName>/<contextName>`; context `name` must not contain `/`); `packages/core/README.md` stays core-only
- Root `README.md`: early-development disclaimer near the top; the lumpfish blockquote, `assets/lumpfish.jpg` (~240px, landscape; Wikimedia Commons `Merivarblane.jpg` by Tiit Hunt, CC BY-SA 3.0 — keep the credit line under the image), and the LUMP backronym live in a closing **Why the name** section so Quick start stays above the fold; npm package READMEs carry no lumpfish image
- npm-published `packages/apps/cli/README.md` doc links: absolute GitHub URLs to `packages/apps/cli/DOCS/...` (relative `DOCS/` hrefs 404 on npmjs.com); keep relative links inside `DOCS/` for GitHub browsing
- When CLI flags change, document only the current spelling — no migration guides unless the user asks
- `lumpConfig.schema.json` is part of the user-facing docs surface (editors read it via `$schema`) — keep descriptions, examples, and field coverage aligned with real CLI behavior, same as README/DOCS. Recipe `desc.yml` schemas live in `packages/recipes/schemas/` (`backlogDesc.schema.json`, `featureBacklogDesc.schema.json`); same bar; editors use `# yaml-language-server: $schema=` or `yaml.schemas`
- Cross-cutting topics (e.g. branch resolution, concurrency/locks) get **one canonical section in `DOCS/start/run.md`**; other pages link there instead of re-explaining — avoid duplicated prose that drifts
- `maximumNumberOfConcurrentBranches` caps remote `lump/<name>/*` branches, not pull requests. A branch stops counting when every `LUMP: <lumpName> - <context>` line it carries is already on a non-lump branch, or when its tip is. A branch with no line, or a squash that drops one, still counts until it is deleted (`lumpcode clean`, or the host's delete-branch-on-merge). The worker page owns that sentence. Other pages link to it instead of saying the setting caps open PRs
- `AGENTS.md` continual-learning: capture durable principles and workspace facts, not session change logs or verbatim grilling Q&A outcomes
