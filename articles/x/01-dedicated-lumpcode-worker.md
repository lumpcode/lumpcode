# How to set up a dedicated Lumpcode worker

A dedicated worker is a clone Lumpcode owns. Don’t develop on it. Pre-flight hard-resets the checkout.

## 1. Provision the machine

```bash
# Node 22+
node -v

git clone <your-repo-url> lumpcode-worker
cd lumpcode-worker
```

## 2. Install the CLI

```bash
npm install -g @lumpcode/cli
lumpcode --version
```

## 3. Initialize as dedicated

```bash
lumpcode project-setup --mode dedicated --primaryBranch dev
```

Or edit gitignored `.lumpcode/local.json`:

```json
{
  "mode": "dedicated",
  "workspaceStrategy": "worktree",
  "maxParallelRun": 2,
  "primaryBranches": ["dev", "feature/*"]
}
```

`worktree` keeps the main tree on the base branch and lets parallel lumps run safely.

## 4. Auth the agent on that box

Whatever your lumps use (`cursor`, `copilot`, …) must work non-interactively here (CLI login / API keys).

## 5. Smoke-test one lump

```bash
lumpcode lump-status
lumpcode run <lumpName>
```

## 6. Start the daemon

```bash
# All lumps, every 5 minutes
lumpcode start

# Or filtered + parallel
lumpcode start \
  --include='backlog,abstraction*' \
  --exclude=ideasToBacklog \
  --maxParallelRun 2
```

## 7. Operate it

```bash
lumpcode daemon-status
lumpcode daemon-log --lines 100
lumpcode stop
lumpcode restart
```

You merge PRs on your laptop. The worker ticks the next eligible context.
