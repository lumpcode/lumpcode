import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { generateSeoFiles } from './generateSeoFiles'

const websiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(websiteRoot, '../../..')

function readRepo(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

function readWebsite(path: string): string {
  return readFileSync(join(websiteRoot, path), 'utf8')
}

function section(markdown: string, start: string, end: string): string {
  const from = markdown.indexOf(start)
  const to = markdown.indexOf(end, from + start.length)
  expect(from, start).toBeGreaterThanOrEqual(0)
  expect(to, end).toBeGreaterThan(from)
  return markdown.slice(from, to)
}

describe('install prompt asset', () => {
  const prompt = readWebsite('app/assets/install-prompt.md')

  it('covers the runbook contract', () => {
    const required = [
      'git repository root',
      'git remote get-url origin',
      'Node.js is 22',
      'npm install -g @lumpcode/cli',
      'npx skills add lumpcode/skills -y',
      'https://github.com/lumpcode/skills',
      'https://www.lumpcode.com/llms.txt',
      'git symbolic-ref refs/remotes/origin/HEAD',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      'bun.lock',
      'cursor-agent',
      'claude-code',
      'gh auth status',
      '**Agent tag.**',
      '**Model.**',
      '**Workspace strategy.**',
      '**GitHub PRs.**',
      '**Worker path.**',
      '**Real first lump.**',
      '**Validation.**',
      'lumpcode project-setup',
      'export function defineLump',
      'postSetupWorkspaceFn',
      'openPrPostTeardown',
      'npm ci',
      'pnpm install',
      'yarn install',
      'bun install',
      'lumpcode lump-create',
      'lumpcode lump-plan <name> --contexts --prompts',
      'Proceed to commit the setup on a `lumpcode/setup` branch',
      'git switch -c lumpcode/setup',
      'git push -u origin lumpcode/setup',
      'git clone --branch lumpcode/setup <origin-url> <workerPath>',
      '"mode": "shared"',
      'gh pr create --base <primary> --head lumpcode/setup',
      'Never merge the setup pull request yourself',
      'git cat-file -e origin/<primary>:.lumpcode/lumps/<name>/config.ts',
      'Never use `git add -A`',
      '"mode": "dedicated"',
      '"workspaceStrategy": "worktree"',
      '"maxParallelRun": 1',
      'lumpcode run <name> --json',
      '__VALIDATION_FAILED__',
      'git push origin --delete lumpcode/setup',
      'lumpcode start',
      'lumpcode daemon-status',
      'lumpcode dashboard',
      'lumpcode transcript --lumpName <name>',
      'requireArtifactStep',
      'shellCommand',
      'node_modules',
      'Never force-push',
      'git reset --hard',
      'git clean',
      'https://www.lumpcode.com/install-prompt.md',
    ]
    for (const phrase of required) {
      expect(prompt, phrase).toContain(phrase)
    }
  })

  it('wraps the real lump in its validation loop', () => {
    const real = section(prompt, '## Step 6: Real first lump', '## Step 7:')
    expect(real).toContain('retryUntilGreen')
    expect(real).toContain('shellCommand')
    expect(real).toContain('requireArtifactStep')
  })

  it('never pushes to the primary branch and drops the smoke lump', () => {
    const pushes = [...prompt.matchAll(/git push[^\n`]*/g)].map((match) => match[0])
    expect(pushes.length).toBeGreaterThan(0)
    for (const push of pushes) {
      expect(push, push).not.toMatch(/<primary>|\bmain\b|\bmaster\b/)
    }
    expect(prompt).toContain('Never push to the primary branch')
    expect(prompt.toLowerCase()).not.toContain('smoke')
  })

  it('tests the lump in the worker clone before the merge, and starts the worker after it', () => {
    const order = [
      '## Step 7: Setup branch',
      '## Step 8: Worker clone',
      '## Step 9: Test the lump in the worker clone',
      '## Step 10: Setup pull request',
      '## Step 11: Start the worker',
    ].map((heading) => prompt.indexOf(heading))
    for (const at of order) expect(at).toBeGreaterThan(-1)
    expect([...order].sort((x, y) => x - y)).toEqual(order)
    const test = section(prompt, '## Step 9:', '## Step 10:')
    expect(test).toContain('Nothing is committed and nothing is pushed')
    const start = section(prompt, '## Step 11:', '## Step 12:')
    expect(start).toContain('"mode": "dedicated"')
    expect(start.indexOf('git cat-file -e')).toBeLessThan(start.indexOf('lumpcode start'))
  })
})

describe('landing install CTA', () => {
  const page = readWebsite('app/pages/index.vue')
  const button = readWebsite('app/components/CopySetupPrompt.vue')

  it('copies the runbook with a polite status that resets', () => {
    expect(button).toContain('Copy setup prompt')
    expect(button).toContain('Copy failed')
    expect(button).toContain('navigator.clipboard.writeText(installPrompt)')
    expect(button).toContain('aria-live="polite"')
    expect(button).toContain('1600')
  })

  it('sits in the hero below Get started and View on GitHub', () => {
    const hero = page.slice(page.indexOf('hero-actions'), page.indexOf('hero-visual'))
    const copyAt = hero.indexOf('<CopySetupPrompt />')
    const startAt = hero.indexOf('Get started')
    const githubAt = hero.indexOf('View on GitHub')
    expect(startAt).toBeGreaterThan(-1)
    expect(copyAt).toBeGreaterThan(githubAt)
    expect(githubAt).toBeGreaterThan(startAt)
    expect(hero).toContain('Paste it into your coding agent.')
  })

  it('keeps the button above the existing install snippets', () => {
    expect(page).toContain(
      'Paste it into your coding agent. It installs the skill, sets up this repo and a dedicated worker clone, then proposes and runs a first lump.',
    )
    expect(page).toContain('Install the CLI.')
    expect(page).toContain('installSkillLabel')
    expect(page).toContain('/lumpcode')
    const install = page.slice(page.indexOf('id="install"'))
    const copyAt = install.indexOf('<CopySetupPrompt />')
    const dividerAt = install.indexOf('Or do it yourself')
    const cliAt = install.indexOf('installCliLabel')
    expect(copyAt).toBeGreaterThan(-1)
    expect(dividerAt).toBeGreaterThan(copyAt)
    expect(cliAt).toBeGreaterThan(dividerAt)
  })

  it('does not add a docs page, sidebar entry, or nav link', () => {
    expect(readWebsite('app/utils/docsNav.ts')).not.toContain('install-prompt')
    expect(readWebsite('app/components/DocsSidebar.vue')).not.toContain('install-prompt')
    expect(readWebsite('app/components/AppHeader.vue')).not.toContain('install-prompt')
    expect(readWebsite('app/components/AppHeader.vue')).not.toContain('Copy setup prompt')
  })
})

describe('lumpcode skill', () => {
  const skill = readRepo('.agents/skills/lumpcode/SKILL.md')

  it('adds defineLump and validation proposal without dropping the authoring rules', () => {
    const section = skill.slice(skill.indexOf('## A shared defineLump for your repo'))
    expect(section).toContain('export function defineLump')
    expect(section).toContain('postSetupWorkspaceFn')
    expect(section).toContain('openPrPostTeardown')
    expect(section).toContain('retryUntilGreen')
    expect(section).toContain('shellCommand')
    expect(section).toContain('### Propose validation')
    expect(section).toContain('requireArtifactStep')
    expect(section).toContain('getValidationLoopSteps')
    expect(section).toContain('pushOnValidationFailure')
    expect(section).toContain('__VALIDATION_FAILED__')
    expect(section).toContain('Do not add it silently')
    expect(skill).toContain('Exactly **one** context source')
    expect(skill).toContain('exactly one prompt definition')
    expect(skill).toContain('lumpcode lump-plan <lumpName>')
    expect(skill).toContain('Do not run the lump unless the user asks.')
  })
})

describe('generateSeoFiles install prompt', () => {
  it('writes the markdown, the headers rule, and the llms.txt link', () => {
    generateSeoFiles({ websiteRoot })
    const asset = readWebsite('app/assets/install-prompt.md').replace(/\r\n/g, '\n')
    const expected = asset.endsWith('\n') ? asset : `${asset}\n`
    const published = readWebsite('public/install-prompt.md')
    expect(published).toBe(expected)
    expect(published.endsWith('\n')).toBe(true)

    const headers = readWebsite('public/_headers')
    expect(headers).toContain('/install-prompt.md\n  Content-Type: text/markdown; charset=utf-8\n')
    expect(headers).not.toMatch(/\/install-prompt\.md\n {2}Content-Type: text\/markdown; charset=utf-8\n {2}Link:/)

    const llms = readWebsite('public/llms.txt')
    expect(llms).toContain('https://www.lumpcode.com/install-prompt.md')
    expect(llms).toContain('## Optional')

    expect(readWebsite('public/sitemap.xml')).not.toContain('install-prompt')
    expect(readWebsite('.gitignore')).toContain('public/install-prompt.md')

    const ignored = execFileSync('git', ['check-ignore', 'packages/apps/website/public/install-prompt.md'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim()
    expect(ignored).toBe('packages/apps/website/public/install-prompt.md')
  })
})
