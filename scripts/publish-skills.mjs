#!/usr/bin/env node
/**
 * Sync allowlisted skills from this monorepo into the lumpcode/skills git repo
 * and push (skills.sh has no publish API; install is `npx skills add lumpcode/skills`).
 *
 * Usage (from repo root):
 *   npm run publish-skills
 *   npm run publish-skills -- --dry-run
 *   npm run publish-skills -- --repo /path/to/skills.git
 *   node scripts/publish-skills.mjs --help
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PUBLIC_SKILLS } from "./public-skills.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "..");
export const DEFAULT_SKILLS_REPO = "https://github.com/lumpcode/skills.git";
const COMMIT_MESSAGE = "sync skills from lumpcode/lumpcode";

/**
 * @param {string[]} argv
 * @returns {{ dryRun: boolean, repo: string, help: boolean }}
 */
export function parsePublishSkillsArgs(argv) {
  let dryRun = false;
  let repo = DEFAULT_SKILLS_REPO;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--repo") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("Missing value for --repo");
      }
      repo = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("--repo=")) {
      const value = arg.slice("--repo=".length);
      if (!value) {
        throw new Error("Missing value for --repo");
      }
      repo = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\nRun with --help for usage.`);
  }

  return { dryRun, repo, help };
}

/**
 * @param {string} contents
 * @returns {string | undefined}
 */
export function readSkillFrontmatterName(contents) {
  const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return undefined;
  }
  const nameLine = match[1].match(/^name:\s*(.+)\s*$/m);
  if (!nameLine) {
    return undefined;
  }
  return nameLine[1].trim();
}

/**
 * @param {{ repo?: string, dryRun?: boolean, repoRoot?: string, skills?: typeof PUBLIC_SKILLS }} [options]
 */
export function publishSkills(options = {}) {
  const repo = options.repo ?? DEFAULT_SKILLS_REPO;
  const dryRun = options.dryRun === true;
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const skills = options.skills ?? PUBLIC_SKILLS;

  if (!Array.isArray(skills) || skills.length === 0) {
    throw new Error("PUBLIC_SKILLS is empty");
  }

  for (const skill of skills) {
    validateCatalogEntry(skill, repoRoot);
  }

  const cloneDir = mkdtempSync(join(tmpdir(), "lumpcode-publish-skills-"));
  try {
    git(["clone", "--depth", "1", repo, cloneDir], { cwd: repoRoot });

    for (const skill of skills) {
      const sourcePath = resolve(repoRoot, skill.sourceDir);
      const destPath = join(cloneDir, skill.destDir);
      rmSync(destPath, { recursive: true, force: true });
      cpSync(sourcePath, destPath, { recursive: true });
    }

    const status = git(["status", "--porcelain"], {
      cwd: cloneDir,
      capture: true,
    }).stdout.trim();

    if (!status) {
      console.log("Already up to date.");
      return { updated: false, dryRun };
    }

    const diff = git(["diff", "--stat"], { cwd: cloneDir, capture: true }).stdout;
    if (diff.trim()) {
      console.log(diff.trimEnd());
    }
    const untracked = git(["status", "--short"], {
      cwd: cloneDir,
      capture: true,
    }).stdout.trim();
    if (untracked) {
      console.log(untracked);
    }

    if (dryRun) {
      console.log("Dry run: not committing or pushing.");
      return { updated: true, dryRun: true };
    }

    git(["add", "-A"], { cwd: cloneDir });
    git(["commit", "-m", COMMIT_MESSAGE], { cwd: cloneDir });
    git(["push", "origin", "HEAD:main"], { cwd: cloneDir });
    console.log(`Pushed ${COMMIT_MESSAGE}`);
    return { updated: true, dryRun: false };
  } finally {
    rmSync(cloneDir, { recursive: true, force: true });
  }
}

/**
 * @param {{ id: string, sourceDir: string, destDir: string }} skill
 * @param {string} repoRoot
 */
function validateCatalogEntry(skill, repoRoot) {
  const sourcePath = resolve(repoRoot, skill.sourceDir);
  const skillMdPath = join(sourcePath, "SKILL.md");
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing sourceDir for skill ${skill.id}: ${skill.sourceDir}`);
  }
  if (!existsSync(skillMdPath)) {
    throw new Error(`Missing SKILL.md for skill ${skill.id}: ${skill.sourceDir}`);
  }
  const name = readSkillFrontmatterName(readFileSync(skillMdPath, "utf8"));
  if (!name) {
    throw new Error(`SKILL.md for ${skill.id} has no YAML name`);
  }
  if (name !== skill.id) {
    throw new Error(
      `SKILL.md name "${name}" does not match catalog id "${skill.id}"`,
    );
  }
}

function printHelp() {
  console.log(`Sync allowlisted skills to lumpcode/skills and push.

Prerequisites
  - git on PATH, credentials that can push to the skills repo
  - public GitHub repo lumpcode/skills already exists (this script does not create it)
  - operator git identity (user.name / user.email), or GIT_AUTHOR_* / GIT_COMMITTER_*

Quick start (from repo root)
  npm run publish-skills -- --help
  npm run publish-skills -- --dry-run
  npm run publish-skills

npm (pass flags after --)
  npm run publish-skills
  npm run publish-skills -- --dry-run
  npm run publish-skills -- --repo <git-url>

Direct invocation
  node scripts/publish-skills.mjs
  node scripts/publish-skills.mjs --dry-run
  node scripts/publish-skills.mjs --repo <git-url>
`);
}

/**
 * @param {string[]} args
 * @param {{ cwd: string, capture?: boolean }} options
 */
function git(args, options) {
  const result = spawnSync("git", args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(
      `git ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`,
    );
  }
  return result;
}

function isExecutedAsMain() {
  const invoked = process.argv[1];
  if (!invoked) {
    return false;
  }
  return resolve(invoked) === fileURLToPath(import.meta.url);
}

function main() {
  try {
    const args = parsePublishSkillsArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      process.exit(0);
    }
    publishSkills(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

if (isExecutedAsMain()) {
  main();
}
