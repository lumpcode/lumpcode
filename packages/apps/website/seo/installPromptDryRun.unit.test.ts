import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { delimiter, tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'esbuild'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const promptPath = join(repoRoot, 'packages/apps/website/app/assets/install-prompt.md')

const parent = mkdtempSync(join(tmpdir(), 'lump-install-prompt-'))
const projectRoot = join(parent, 'scratch')
const remoteDir = join(parent, 'origin.git')
const bundleDir = join(parent, 'bundle')
const globalConfig = join(parent, 'global')
const worktreeDir = join(parent, 'worktree')
const checkoutDir = join(parent, 'checkout')
const stubDir = join(parent, 'bin')

function assertUnderTmp(dir: string): void {
  const tmp = resolve(tmpdir())
  const rel = relative(tmp, resolve(dir))
  if (rel.startsWith('..') || rel === '' || resolve(dir) === tmp) {
    throw new Error(`refusing git init outside os.tmpdir(): ${dir}`)
  }
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function write(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
}

function extractDefineLump(markdown: string): string {
  const blocks = [...markdown.matchAll(/```ts\n([\s\S]*?)```/g)].map((match) => match[1] ?? '')
  const source = blocks.find((block) => block.includes('export function defineLump'))
  if (source === undefined) throw new Error('install-prompt.md is missing the defineLump block')
  return source
}

function linkPackages(directory: string): void {
  const scope = join(directory, 'node_modules', '@lumpcode')
  mkdirSync(scope, { recursive: true })
  const packages = {
    core: 'packages/core',
    'cli-types': 'packages/apps/cli/cli-types',
    'cli-utils': 'packages/apps/cli/cli-utils',
    recipes: 'packages/recipes',
  }
  for (const [name, rel] of Object.entries(packages)) {
    const target = join(repoRoot, rel)
    const link = join(scope, name)
    if (!existsSync(link)) symlinkSync(target, link)
  }
}

function gitStatus(): string {
  return git(projectRoot, ['status', '--porcelain'])
}

type DefineLumpModule = {
  defineLump: (config: Record<string, unknown>) => {
    command?: unknown
    steps?: unknown
    lumpVariables?: Record<string, unknown>
    postSetupWorkspaceFn?: (input: Record<string, unknown>) => { command?: string } | undefined
    postTeardownWorkspaceFn?: unknown
    postSetupWorkspaceCommand?: unknown
    postTeardownWorkspaceCommand?: unknown
  }
}

let defineLumpModule: DefineLumpModule
let head: string

beforeAll(async () => {
  assertUnderTmp(projectRoot)
  assertUnderTmp(remoteDir)
  mkdirSync(projectRoot, { recursive: true })
  mkdirSync(remoteDir, { recursive: true })
  git(remoteDir, ['init', '--bare', '-b', 'main'])
  git(projectRoot, ['init', '-b', 'main'])
  git(projectRoot, ['config', 'user.email', 'test@test.com'])
  git(projectRoot, ['config', 'user.name', 'Test'])

  const template = extractDefineLump(readFileSync(promptPath, 'utf8'))
  write(join(projectRoot, '.lumpcode/templates/main.ts'), template)
  write(
    join(projectRoot, '.lumpcode/project.json'),
    `${JSON.stringify({ projectName: 'scratch', primaryBranch: 'main' }, null, 2)}\n`,
  )
  write(join(projectRoot, '.lumpcode/local.json'), `${JSON.stringify({ mode: 'shared' }, null, 2)}\n`)
  write(
    join(projectRoot, '.gitignore'),
    'node_modules\n.lumpcode/.cache/\n',
  )
  write(
    join(projectRoot, 'package.json'),
    `${JSON.stringify({ name: 'scratch', private: true, scripts: { test: 'node --check src/hello.ts' } }, null, 2)}\n`,
  )
  write(join(projectRoot, 'src/hello.ts'), 'export function hello(): string {\n  return \'hello\'\n}\n')
  write(join(projectRoot, '.env'), 'ROOT=1\n')
  write(join(projectRoot, 'src/.env.local'), 'from-project\n')
  write(join(projectRoot, 'config/.env.production'), 'prod=1\n')
  write(join(projectRoot, '.env.backup'), 'backup=1\n')
  write(join(projectRoot, 'notes.env'), 'nope\n')
  write(join(projectRoot, '.environment'), 'nope\n')
  write(join(projectRoot, 'node_modules/.env'), 'secret\n')
  write(join(projectRoot, '.lumpcode/.env'), 'skip-lumpcode\n')
  write(join(projectRoot, '.worktrees/foo/.env'), 'skip-worktree\n')
  write(
    join(projectRoot, '.lumpcode/lumps/noteHello/config.ts'),
    `import { defineLump } from '../../templates/main'
import { retryUntilGreenSteps, shellCommand } from '@lumpcode/recipes'

export default defineLump({
  contextListJson: { FILE: 'src/{NAME}.ts' },
  steps: retryUntilGreenSteps({
    steps: [{ promptTemplate: 'Add a one-line comment to the top of @{FILE}. Change nothing else.' }],
    validationCommandFn: () => shellCommand('npm test'),
  }),
})
`,
  )

  git(projectRoot, ['add', '.gitignore', 'package.json', 'src/hello.ts', '.env', 'src/.env.local', 'config/.env.production', '.env.backup', 'notes.env', '.environment', '.lumpcode', '.worktrees'])
  git(projectRoot, ['commit', '-m', 'init'])
  git(projectRoot, ['remote', 'add', 'origin', remoteDir])
  git(projectRoot, ['push', '-u', 'origin', 'main'])
  git(projectRoot, ['remote', 'set-head', 'origin', 'main'])
  head = git(projectRoot, ['rev-parse', 'HEAD'])

  linkPackages(projectRoot)
  linkPackages(bundleDir)
  write(
    join(stubDir, 'cursor-agent'),
    '#!/bin/sh\nif [ "$1" = "create-chat" ]; then\n  printf \'fake-chat\\n\'\n  exit 0\nfi\nprintf \'unexpected: %s\\n\' "$*" >&2\nexit 1\n',
  )
  execFileSync('chmod', ['+x', join(stubDir, 'cursor-agent')])

  const outfile = join(bundleDir, 'defineLump.mjs')
  await build({
    absWorkingDir: projectRoot,
    bundle: true,
    entryPoints: [join(projectRoot, '.lumpcode/templates/main.ts')],
    format: 'esm',
    packages: 'external',
    platform: 'node',
    target: 'node22',
    outfile,
  })
  defineLumpModule = (await import(pathToFileURL(outfile).href)) as DefineLumpModule
})

afterAll(() => {
  rmSync(parent, { recursive: true, force: true })
})

function hookInput(workspacePath: string, workspaceStrategy: 'worktree' | 'checkout') {
  return {
    baseBranch: 'main',
    branchName: 'lump/noteHello/hello',
    contextList: [],
    workspacePath,
    executionWorkspacePath: projectRoot,
    workspaceStrategy,
    projectRoot,
    lumpVariables: {},
  }
}

describe('defineLump from the runbook', () => {
  it('injects the command and model, and does not inject validation', () => {
    const config = defineLumpModule.defineLump({
      contextListJson: [{ name: 'one', variables: { FILE: 'src/hello.ts' } }],
      prompt: { promptTemplate: 'Edit @{FILE}.' },
    })
    expect(config.command).toBe('cursor')
    expect(config.lumpVariables).toEqual({ model: 'auto' })
    expect(config.steps).toBeUndefined()
    expect(config.postSetupWorkspaceFn).toEqual(expect.any(Function))
    expect(config.postTeardownWorkspaceFn).toEqual(expect.any(Function))
  })

  it('keeps a lump override of lumpVariables and lets the caller replace the command', () => {
    const config = defineLumpModule.defineLump({
      command: 'copilot',
      lumpVariables: { model: 'other', outputDetail: 'quiet' },
      contextListJson: [{ name: 'one', variables: { FILE: 'src/hello.ts' } }],
      prompt: { promptTemplate: 'Edit @{FILE}.' },
    })
    expect(config.command).toBe('copilot')
    expect(config.lumpVariables).toEqual({ model: 'other', outputDetail: 'quiet' })
  })

  it('merges a partial lumpVariables bag over the default model', () => {
    const config = defineLumpModule.defineLump({
      lumpVariables: { outputDetail: 'quiet' },
      contextListJson: [{ name: 'one', variables: { FILE: 'src/hello.ts' } }],
      prompt: { promptTemplate: 'Edit @{FILE}.' },
    })
    expect(config.lumpVariables).toEqual({ model: 'auto', outputDetail: 'quiet' })
  })

  it('keeps a caller hook and skips injection when a hook command is set', () => {
    const customSetup = () => undefined
    const customTeardown = () => undefined
    const withFns = defineLumpModule.defineLump({
      postSetupWorkspaceFn: customSetup,
      postTeardownWorkspaceFn: customTeardown,
      contextListJson: [{ name: 'one', variables: {} }],
      prompt: { promptTemplate: 'Hi.' },
    })
    expect(withFns.postSetupWorkspaceFn).toBe(customSetup)
    expect(withFns.postTeardownWorkspaceFn).toBe(customTeardown)

    const withCommands = defineLumpModule.defineLump({
      postSetupWorkspaceCommand: 'npm ci',
      postTeardownWorkspaceCommand: 'echo done',
      contextListJson: [{ name: 'one', variables: {} }],
      prompt: { promptTemplate: 'Hi.' },
    })
    expect(withCommands.postSetupWorkspaceFn).toBeUndefined()
    expect(withCommands.postTeardownWorkspaceFn).toBeUndefined()
    expect(withCommands.postSetupWorkspaceCommand).toBe('npm ci')
    expect(withCommands.postTeardownWorkspaceCommand).toBe('echo done')
  })

  it('prepares a worktree and does nothing for checkout, without git changes', async () => {
    mkdirSync(worktreeDir, { recursive: true })
    write(join(worktreeDir, 'src/.env.local'), 'keep\n')
    const before = gitStatus()
    const prepared = await defineLumpModule.defineLump({
      contextListJson: [{ name: 'one', variables: {} }],
      prompt: { promptTemplate: 'Hi.' },
    }).postSetupWorkspaceFn?.(hookInput(worktreeDir, 'worktree'))
    expect(prepared).toEqual({ command: 'npm ci' })
    expect(readFileSync(join(worktreeDir, '.env'), 'utf8')).toBe('ROOT=1\n')
    expect(readFileSync(join(worktreeDir, 'src/.env.local'), 'utf8')).toBe('keep\n')
    expect(readFileSync(join(worktreeDir, 'config/.env.production'), 'utf8')).toBe('prod=1\n')
    expect(readFileSync(join(worktreeDir, '.env.backup'), 'utf8')).toBe('backup=1\n')
    expect(existsSync(join(worktreeDir, 'notes.env'))).toBe(false)
    expect(existsSync(join(worktreeDir, '.environment'))).toBe(false)
    expect(existsSync(join(worktreeDir, 'node_modules/.env'))).toBe(false)
    expect(existsSync(join(worktreeDir, '.lumpcode/.env'))).toBe(false)
    expect(existsSync(join(worktreeDir, '.worktrees/foo/.env'))).toBe(false)
    expect(gitStatus()).toBe(before)
    expect(git(projectRoot, ['rev-parse', 'HEAD'])).toBe(head)

    mkdirSync(checkoutDir, { recursive: true })
    const skipped = await defineLumpModule.defineLump({
      contextListJson: [{ name: 'one', variables: {} }],
      prompt: { promptTemplate: 'Hi.' },
    }).postSetupWorkspaceFn?.(hookInput(checkoutDir, 'checkout'))
    expect(skipped).toBeUndefined()
    expect(existsSync(join(checkoutDir, '.env'))).toBe(false)
    expect(gitStatus()).toBe('')
    expect(git(projectRoot, ['rev-parse', 'HEAD'])).toBe(head)
  })

  it('leaves teardown unset when pull requests are off', async () => {
    const source = extractDefineLump(readFileSync(promptPath, 'utf8')).replace(
      'const OPEN_PR = true',
      'const OPEN_PR = false',
    )
    const outfile = join(bundleDir, 'defineLump-no-pr.mjs')
    const entry = join(bundleDir, 'main-no-pr.ts')
    write(entry, source)
    await build({
      absWorkingDir: bundleDir,
      bundle: true,
      entryPoints: [entry],
      format: 'esm',
      packages: 'external',
      platform: 'node',
      target: 'node22',
      outfile,
    })
    const off = (await import(pathToFileURL(outfile).href)) as DefineLumpModule
    const config = off.defineLump({
      contextListJson: [{ name: 'one', variables: {} }],
      prompt: { promptTemplate: 'Hi.' },
    })
    expect(config.postTeardownWorkspaceFn).toBeUndefined()
    expect(config.steps).toBeUndefined()
  })
})

describe('lump-plan dry run', () => {
  it('plans the real lump with its validation command', async () => {
    const realSource = readFileSync(join(projectRoot, '.lumpcode/lumps/noteHello/config.ts'), 'utf8')
    expect(realSource).toContain("shellCommand('npm test')")
    expect(realSource).toContain('retryUntilGreenSteps')

    const { planLumpFromJsConfig } = await import(
      '../../cli/src/utils/planLumpFromJsConfig/main.ts'
    )
    const previousPath = process.env.PATH
    process.env.PATH = `${stubDir}${delimiter}${previousPath ?? ''}`
    try {
      const real = await planLumpFromJsConfig({
        lumpName: 'noteHello',
        localConfigFolderPath: join(projectRoot, '.lumpcode'),
        globalConfigFolderPath: globalConfig,
        projectRoot,
        depth: 'prompts',
      })
      expect(real.success, real.success ? '' : String(real.data)).toBe(true)
      if (!real.success) return
      expect(real.data.contexts?.map((context) => context.name)).toEqual(['hello'])
      const realText = JSON.stringify(real.data.promptsByContext)
      expect(realText).toContain('npm test')
      expect(realText).toContain('src/hello.ts')
    } finally {
      process.env.PATH = previousPath
    }

    expect(git(projectRoot, ['rev-parse', 'HEAD'])).toBe(head)
  })
})
