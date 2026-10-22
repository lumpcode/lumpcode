# Docs and vocabulary

How README, `packages/apps/cli/DOCS/`, schemas, and skills talk about Lumpcode.

- Keep user-facing docs (`README`, `DOCS/`) aligned with real CLI behavior; avoid internal implementation detail unless an operator truly needs it. Position Lumpcode as a **loop engineering** tool (term woven once into root/CLI READMEs + `DOCS/start/terms.md`; `loop-engineering` npm keyword on cli/core/cli-types) — one mention per surface, not keyword stuffing
- Publishable package READMEs (`@lumpcode/recipes`, `@lumpcode/cli-utils`, …) are operator-facing: no "private monorepo" or "Published …" status framing; point to `@lumpcode/cli` as the main install when the package is an add-on
- **Lump**: configured long-running agent loop campaign (`.lumpcode/lumps/`, `lumpcode run`); large body of work too big for one chat — both repetitive edits (migrations, codemods) **and** planned feature roadmaps; avoid "set up once" framing (project setup is followed by recurring per-lump authoring)
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
- `AGENTS.md` continual-learning: capture durable principles and workspace facts, not session change logs or verbatim grilling Q&A outcomes
