# Example lumps

Eight common shapes for a lump, each a complete, drop-in `.lumpcode/lumps/<name>/config.json` (or `config.js`). Mix and match: a lump can use `contextMatchFn` for discovery and multi-step `steps`; a ticket queue can include `setupFn` to install deps before the agent runs; a sweep can add `branchFn` to follow your team's naming convention.

Deep references: [concepts.md](./concepts.md), [lump-config.md](./lump-config.md), [advanced-config.md](./advanced-config.md), [types.md](./types.md).

---

## 0. Smoke test — one context, minimal prompt

*When to use:* right after `lumpcode lump-create` to confirm remotes, agent command, and marker commits before you invest in a real lump.

Uses a single fixed path every repo already has (`README.md`). Adjust `FILE` if your project root has no `README.md`.

`.lumpcode/lumps/smokeTest/config.json`:

```json
{
  "contextListJson": {
    "FILE": "README.md"
  },
  "prompt": {
    "promptTemplate": "Reply with exactly one line: smoke OK for @{FILE}. Do not edit any file.",
    "command": "copilot"
  }
}
```

(`baseBranch` defaults to `projectBaseBranch` from `.lumpcode/local.json`; add it on a lump only to override.)

Run once: `lumpcode run smokeTest`, then `git log --remotes --grep '^LUMP:' --oneline` and `lumpcode lump-status --lumpName smokeTest`.

## 1. Framework migration campaign — React → Vue, one component per branch

*When to use:* large UI migration with one reviewable PR per component.

A classic refactoring lump: discover every component folder, do a multi-step migration, ship one PR per component.

```json
{
  "command": "copilot",
  "contextListJson": {
    "FOLDER": "src/components/{COMPONENT_NAME}/",
    "TYPES":  "src/components/{COMPONENT_NAME}/{COMPONENT_NAME}.types.ts",
    "TEST":   "src/components/{COMPONENT_NAME}/{COMPONENT_NAME}.test.ts",
    "COMPONENT": "src/components/{COMPONENT_NAME}/$upperFirst{COMPONENT_NAME}.tsx"
  },
  "steps": [
    "Read @{COMPONENT}, @{TYPES}, and @{TEST}. Produce a short migration plan and save it to src/components_vue/{COMPONENT_NAME}/migration-plan.md (no source changes yet).",
    "Following the plan at src/components_vue/{COMPONENT_NAME}/migration-plan.md, port @{COMPONENT} to a Vue 3 <script setup> component at src/components_vue/{COMPONENT_NAME}/{COMPONENT_NAME}.vue. Keep behavior identical.",
    "Port @{TEST} to Vitest + @vue/test-utils, saved to src/components_vue/{COMPONENT_NAME}/{COMPONENT_NAME}.test.ts. Run the tests and fix anything that breaks."
  ]
}
```

Lumpcode commits each context as `LUMP: reactToVue - <ComponentName>` on `lump/reactToVue/<ComponentName>` and pushes. Already-migrated components are skipped automatically on subsequent runs.

## 2. Feature ticket queue — strict dependency order

*When to use:* ordered backlog where later work must wait until earlier tickets are merged to the base branch.

Treat a JSON ticket file as the source of truth and let `dependsOnContexts` enforce order. Subsequent tickets only become eligible once their dependency’s commit is on `origin/<projectBaseBranch>` (i.e. merged).

`.lumpcode/lumps/userProfile/config.json`:

```json
{
  "command": "copilot",
  "getContextListFn": "./tickets.js",
  "numberOfContextsPerBranch": 1,
  "prompt": {
    "promptTemplate": "Implement ticket {TICKET_ID}: {TITLE}\n\nAcceptance criteria:\n{ACCEPTANCE}\n\nLikely files:\n{FILE_HINT}"
  }
}
```

`.lumpcode/lumps/userProfile/tickets.js`:

```js
export default function getContextListFn() {
  return [
    {
      name: "01-schema",
      variables: {
        TICKET_ID: "PROF-1",
        TITLE: "Add `user_profile` table + Prisma model",
        ACCEPTANCE: "- migration runs cleanly\n- model has bio, avatarUrl, createdAt",
        FILE_HINT: "prisma/schema.prisma, migrations/",
      },
      options: { priority: 1 },
    },
    {
      name: "02-api",
      variables: {
        TICKET_ID: "PROF-2",
        TITLE: "Expose GET/PATCH /me/profile",
        ACCEPTANCE: "- zod-validated body\n- returns 401 when unauth",
        FILE_HINT: "apps/api/src/routes/profile.ts",
      },
      options: { priority: 2, dependsOnContexts: ["01-schema"] },
    },
    {
      name: "03-ui",
      variables: {
        TICKET_ID: "PROF-3",
        TITLE: "Profile edit page in the web app",
        ACCEPTANCE: "- form validates on submit\n- toast on success",
        FILE_HINT: "apps/web/src/pages/profile.tsx",
      },
      options: { priority: 3, dependsOnContexts: ["02-api"] },
    },
  ];
}
```

Pair this with `lumpcode start`: each tick the daemon picks up the next eligible ticket (skipping those whose dependency is still `toDo` or `branchPushed`), opens a PR, and stops until you merge.

## 3. Test coverage sweep — add a test next to every untested module

*When to use:* repo-wide test gaps where simple path patterns are not enough—encode skip logic in code.

Use `contextMatchFn` so the matcher itself decides what to skip. Each call receives `codeBasePath` (the current entry) and `codeBasePaths` (the full scanned list) when you need repo-wide context.

`.lumpcode/lumps/addTests/config.json`:

```json
{
  "command": "copilot",
  "contextMatchFn": "./match.js",
  "maximumNumberOfConcurrentBranches": 5,
  "prompt": {
    "promptTemplate": "Write a thorough Vitest suite for the module at @{SOURCE}. Save it next to it as a `.test.ts` file. Aim for branch coverage on exported functions."
  }
}
```

`.lumpcode/lumps/addTests/match.js`:

```js
import fs from 'node:fs';
export default function match({ codeBasePath }) {
  const { isDir, path } = codeBasePath;
  if (isDir) return null;
  if (!path.endsWith('.ts') || path.endsWith('.test.ts') || path.endsWith('.d.ts')) return null;
  if (!path.startsWith('src/')) return null;
  const testPath = path.replace(/\.ts$/, '.test.ts');
  if (fs.existsSync(testPath)) return null;
  return {
    contextName: path.replaceAll('/', '_').replace(/\.ts$/, ''),
    filePathVariableName: 'SOURCE',
  };
}
```

`maximumNumberOfConcurrentBranches: 5` keeps no more than five test PRs in flight; the daemon waits for review before queuing more.

## 4. Codemod-style API sweep — replace a deprecated import everywhere it appears

*When to use:* many small mechanical edits across files; optionally batch several files per branch.

Each file that imports `lodash` becomes one context. Lumpcode handles the branch-per-file housekeeping.

`.lumpcode/lumps/lodashToEs/config.json`:

```json
{
  "command": "copilot",
  "contextMatchFn": "./match.js",
  "numberOfContextsPerBranch": 10,
  "prompt": {
    "promptTemplate": "Rewrite @{FILE} to remove `lodash`. Replace usages with native ES equivalents (Array methods, Object.fromEntries, structuredClone, etc.). Keep behavior identical and update the imports."
  }
}
```

`.lumpcode/lumps/lodashToEs/match.js`:

```js
import fs from 'node:fs';
export default function match({ codeBasePath }) {
  const { isDir, path } = codeBasePath;
  if (isDir || !/\.(ts|tsx|js|jsx)$/.test(path)) return null;
  const src = fs.readFileSync(path, 'utf8');
  if (!/from ['"]lodash/.test(src)) return null;
  return { contextName: path.replaceAll('/', '_'), filePathVariableName: 'FILE' };
}
```

`numberOfContextsPerBranch: 10` groups ten files per PR so reviewers don’t drown in tiny diffs.

## 5. Documentation generation — one README per package

*When to use:* monorepos where each package should get consistent README content from `package.json` and entrypoints.

Run over `packages/*/` and produce or refresh each package README from real source.

```json
{
  "command": "copilot",
  "contextListJson": {
    "PKG_FOLDER":  "packages/{PKG}/",
    "PKG_JSON":    "packages/{PKG}/package.json",
    "PKG_ENTRY":   "packages/{PKG}/src/index.ts"
  },
  "steps": [
    "Read @{PKG_JSON} and @{PKG_ENTRY} (and other relevant files in @{PKG_FOLDER}). Write or rewrite packages/{PKG}/README.md covering: install, quick example, top exports, and links to deeper docs. Keep it under 200 lines."
  ]
}
```

## 6. Conditional follow-up — only do step B if step A says so

*When to use:* optional second agent pass based on the first answer (saves cost when no follow-up is needed).

Mix a static prompt with a function-form prompt item to short-circuit work when nothing is needed. Requires a JS config so the function can be inline.

`.lumpcode/lumps/maybeBumpDeps/config.js`:

```js
export default {
  command: 'copilot',
  contextListJson: { PKG_JSON: 'packages/{PKG}/package.json' },
  steps: [
    {
      promptTemplate:
        "Inspect @{PKG_JSON}. If any direct dependency is more than two majors behind latest, reply exactly NEEDS_BUMP. Otherwise reply OK.",
      postCommandExecFn: ({ commandResult, contextRunState }) => {
        contextRunState.needsBump = commandResult.includes('NEEDS_BUMP');
      },
    },
    ({ contextRunState }) =>
      contextRunState.needsBump
        ? [
            {
              promptTemplate:
                "Bump outdated direct dependencies in @{PKG_JSON} to their latest minor (no majors). Run the package's tests and fix obvious breakage.",
            },
          ]
        : [],
  ],
};
```

The second item is a **function** that returns either a one-step array or an empty one—Lumpcode skips the upgrade prompt entirely when the analysis says it isn’t needed, so you don’t pay for an agent run per package that’s already current.

## 7. Cross-lump dependency — run after another lump finishes

*When to use:* a downstream lump (docs, integration tests, release notes) should start only after an upstream lump’s context is merged to `projectBaseBranch`.

Two lumps in one project. **`scaffoldApi`** adds API stubs; **`apiDocs`** rewrites README files but only after `scaffoldApi` has finished context `README` on `main`.

`.lumpcode/lumps/scaffoldApi/config.json`:

```json
{
  "command": "copilot",
  "contextListJson": { "NAME": "{NAME}.md" },
  "prompt": {
    "promptTemplate": "Add a one-line API overview section to @{NAME}."
  }
}
```

`.lumpcode/lumps/apiDocs/config.json`:

```json
{
  "command": "copilot",
  "contextListJson": { "NAME": "{NAME}.md" },
  "contextOptionsFn": "./options.js",
  "prompt": {
    "promptTemplate": "Rewrite the API overview in @{NAME} for end users."
  }
}
```

`.lumpcode/lumps/apiDocs/options.js`:

```js
export default function contextOptionsFn() {
  return { dependsOnContexts: ['scaffoldApi/README'] };
}
```

The dependency string is **`scaffoldApi/README`**: lump folder name, `/`, context name. Until `LUMP: scaffoldApi - README` is an ancestor of `origin/main`, `apiDocs` skips every context. After you merge the scaffold PR, `lumpcode run apiDocs` (or the daemon on the next tick) picks up work.

Same-lump ordering without a second lump: [§ 2 Feature ticket queue](#2-feature-ticket-queue--strict-dependency-order).
