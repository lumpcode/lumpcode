import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  defineConfig,
  type LumpJsConfig,
  type LumpVariables,
  type PostSetupWorkspaceFn,
  type StepVariables,
} from '@lumpcode/cli-utils'
import { openPrPostTeardown } from '@lumpcode/recipes'

const COMMAND = 'cursor'
const MODEL = 'grok-4.7-high'
const INSTALL_COMMAND: string = 'npm ci'
const OPEN_PR = true

function copyEnvFiles(projectRoot: string, workspacePath: string): void {
  const skip = new Set(['node_modules', '.git', '.worktrees', '.lumpcode'])
  const walk = (relative: string): void => {
    for (const entry of readdirSync(join(projectRoot, relative), { withFileTypes: true })) {
      if (skip.has(entry.name)) continue
      const child = relative === '' ? entry.name : `${relative}/${entry.name}`
      if (entry.isDirectory()) {
        walk(child)
        continue
      }
      if (entry.name !== '.env' && !entry.name.startsWith('.env.')) continue
      const destination = join(workspacePath, child)
      if (existsSync(destination)) continue
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(join(projectRoot, child), destination)
    }
  }
  walk('')
}

const prepareWorktree: PostSetupWorkspaceFn = (input) => {
  if (input.workspaceStrategy !== 'worktree') return
  copyEnvFiles(input.projectRoot, input.workspacePath)
  return INSTALL_COMMAND === '' ? undefined : { command: INSTALL_COMMAND }
}

export function defineLump<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
>(config: LumpJsConfig<V, SV>): LumpJsConfig<V, SV> {
  const setup =
    config.postSetupWorkspaceCommand !== undefined
      ? {}
      : { postSetupWorkspaceFn: config.postSetupWorkspaceFn ?? prepareWorktree }
  const teardown =
    config.postTeardownWorkspaceCommand !== undefined
      ? {}
      : {
          postTeardownWorkspaceFn:
            config.postTeardownWorkspaceFn ??
            (OPEN_PR ? openPrPostTeardown({ provider: 'github' }) : undefined),
        }
  return defineConfig<V, SV>({
    command: COMMAND,
    ...config,
    lumpVariables: {
      model: MODEL,
      ...((config.lumpVariables ?? {}) as Record<string, unknown>),
    } as unknown as V,
    ...setup,
    ...teardown,
  })
}
