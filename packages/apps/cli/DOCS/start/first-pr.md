# First PR

Install the CLI, run `lumpcode setup`, and rehearse one lump on the branch you are on. Already ran a lump locally? [Try the worker](worker.md).

## 1. Check the prerequisites

- Node.js 22+
- A git repo with an `origin` you can push to, and a primary branch that exists there (usually `main`)
- Git `user.name` and `user.email` set (setup commits the Lumpcode files)
- A CLI agent on `PATH`, already logged in: `cursor-agent`, `copilot`, `claude`, `codex`, or `opencode`

`lumpcode run` calls that agent, so it costs what your agent costs.

## 2. Install the CLI

```bash
npm install -g @lumpcode/cli
lumpcode --version
```

## 2b. Optional: the `/lumpcode` skill

```bash
npx skills add lumpcode/skills
```

It helps the agent **in your editor** write and update lumps with current docs. It is not what runs inside a lump. Setup offers to install it.

## 3. Run setup

From the repo root, on the branch you want to rehearse on:

```bash
lumpcode setup
```

Setup is interactive. It checks git and your agents, then asks a few questions:

- **Primary branch**: guessed from `origin` (`main`, `dev`, …). It must exist on the remote.
- **Mode for this machine**: pick **shared** on your laptop. It means "rehearse here, never reset, never push".
- **Format of the first lump**: JSON is the simple path. JavaScript or TypeScript also installs `@lumpcode/cli-utils` and `@lumpcode/recipes`.

It writes `.lumpcode/` and a first lump at `.lumpcode/lumps/myFirstLump/`, then **pauses so you can edit the config**.

Point the lump at files that exist in this repo. This one ports every component folder that has an `index.tsx` and a test:

```json .lumpcode/lumps/myFirstLump/config.json
{
  "contextListJson": {
    "COMPONENT": "src/components/{NAME}/index.tsx",
    "TEST": "src/components/{NAME}/index.test.tsx"
  },
  "prompt": {
    "promptTemplate": "Port @{COMPONENT} to Vue 3 and update @{TEST}.",
    "command": "cursor"
  }
}
```

Each folder name `{NAME}` where both files exist becomes one **context**, one unit of work. `@{COMPONENT}` in the prompt becomes `@src/components/UserCard/index.tsx`. Use `"copilot"`, `"claude-code"`, `"codex"`, or `"opencode"` if that is your agent.

Not sure yet? Keep the stub setup wrote. It asks the agent to clean up `README.md` (or another file you pick), which is a cheap first run.

## 4. Rehearse on this branch

When you press Enter, setup commits and pushes the `.lumpcode/` files (or prints the git commands if you prefer), lists the contexts it found, and asks before calling the agent. No contexts? It pauses again so you can fix the paths.

The run happens **in place**: the agent edits files in this folder, on this branch. A dirty tree is fine. Nothing is pushed and no `lump/…` branch is created.

When the run finishes, setup shows the changed files and asks:

- `c` to commit the changes with `LUMP: myFirstLump - <context>` markers (still no push)
- `e` to leave the tree as is

Review, then push this branch and open a PR yourself. After editing the lump, check it without calling the agent, then run it again:

```bash
lumpcode lump-plan myFirstLump --contexts --prompts
lumpcode run myFirstLump
```

## Next: let a worker do it

A laptop run is how you check a lump. A **worker** is how you use it: a second clone that runs every lump on a schedule and pushes one branch per item while you review. Make sure `.lumpcode/` is committed and pushed, then [leave a worker running](worker.md).

Scripts and CI that cannot answer prompts use `lumpcode project-setup` (flags only) instead of `setup`. See [Commands](../reference/commands.md#lumpcode-project-setup).
