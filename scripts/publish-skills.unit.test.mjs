import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PUBLIC_SKILLS } from "./public-skills.mjs";
import {
  DEFAULT_SKILLS_REPO,
  parsePublishSkillsArgs,
  publishSkills,
  readSkillFrontmatterName,
  REPO_ROOT,
} from "./publish-skills.mjs";

const SEED_README = `# Lumpcode skills

Agent skills for Lumpcode.

\`\`\`bash
npx skills add lumpcode/skills
\`\`\`
`;
const SEED_LICENSE = "SEED LICENSE";

describe("parsePublishSkillsArgs", () => {
  it("defaults repo and dryRun", () => {
    expect(parsePublishSkillsArgs([])).toEqual({
      dryRun: false,
      repo: DEFAULT_SKILLS_REPO,
      help: false,
    });
  });

  it("parses --dry-run and --repo", () => {
    expect(
      parsePublishSkillsArgs(["--dry-run", "--repo", "/tmp/skills.git"]),
    ).toEqual({
      dryRun: true,
      repo: "/tmp/skills.git",
      help: false,
    });
  });

  it("parses --repo=value", () => {
    expect(parsePublishSkillsArgs(["--repo=/tmp/skills.git"]).repo).toBe(
      "/tmp/skills.git",
    );
  });

  it("throws on unknown flags", () => {
    expect(() => parsePublishSkillsArgs(["--skills", "lumpcode"])).toThrow(
      /Unknown argument/,
    );
  });

  it("throws when --repo is missing a value", () => {
    expect(() => parsePublishSkillsArgs(["--repo"])).toThrow(/Missing value/);
    expect(() => parsePublishSkillsArgs(["--repo", "--dry-run"])).toThrow(
      /Missing value/,
    );
  });
});

describe("readSkillFrontmatterName", () => {
  it("reads the YAML name", () => {
    expect(readSkillFrontmatterName("---\nname: lumpcode\n---\n# Hi\n")).toBe(
      "lumpcode",
    );
  });

  it("returns undefined without frontmatter", () => {
    expect(readSkillFrontmatterName("# Lumpcode\n")).toBeUndefined();
  });
});

describe("publishSkills", () => {
  /** @type {string[]} */
  const tempDirs = [];

  beforeEach(() => {
    process.env.GIT_AUTHOR_NAME = "Lumpcode Test";
    process.env.GIT_AUTHOR_EMAIL = "test@lumpcode.example";
    process.env.GIT_COMMITTER_NAME = "Lumpcode Test";
    process.env.GIT_COMMITTER_EMAIL = "test@lumpcode.example";
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("validates the real catalog SKILL.md names", () => {
    for (const skill of PUBLIC_SKILLS) {
      const skillMd = readFileSync(
        join(REPO_ROOT, skill.sourceDir, "SKILL.md"),
        "utf8",
      );
      expect(readSkillFrontmatterName(skillMd)).toBe(skill.id);
    }
  });

  it("fails before clone when sourceDir is missing", () => {
    expect(() =>
      publishSkills({
        repo: "/no/such/remote.git",
        skills: [
          {
            id: "missing",
            sourceDir: "does-not-exist",
            destDir: "skills/missing",
          },
        ],
      }),
    ).toThrow(/Missing sourceDir/);
  });

  it("fails when YAML name does not match catalog id", () => {
    const sourceRoot = makeTempDir("skill-src-");
    const skillDir = join(sourceRoot, "wrong-name");
    mkdirSync(skillDir);
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: other\n---\n");

    expect(() =>
      publishSkills({
        repo: "/no/such/remote.git",
        repoRoot: sourceRoot,
        skills: [
          {
            id: "wrong-name",
            sourceDir: "wrong-name",
            destDir: "skills/wrong-name",
          },
        ],
      }),
    ).toThrow(/does not match catalog id/);
  });

  it("dry-run copies locally but does not push", () => {
    const { bareRepo, headBefore } = makeSkillsRemote();

    const result = publishSkills({ repo: bareRepo, dryRun: true });
    expect(result).toEqual({ updated: true, dryRun: true });
    expect(gitCapture(["-C", bareRepo, "rev-parse", "HEAD"])).toBe(headBefore);

    const inspectDir = cloneBare(bareRepo);
    expect(existsSync(join(inspectDir, "skills", "lumpcode", "SKILL.md"))).toBe(
      false,
    );
    expect(readFileSync(join(inspectDir, "README.md"), "utf8")).toBe(SEED_README);
  });

  it("pushes allowlisted skills and leaves README, LICENSE, and internals out", () => {
    const { bareRepo } = makeSkillsRemote();

    const result = publishSkills({ repo: bareRepo });
    expect(result).toEqual({ updated: true, dryRun: false });

    const inspectDir = cloneBare(bareRepo);
    const skillMd = readFileSync(
      join(inspectDir, "skills", "lumpcode", "SKILL.md"),
      "utf8",
    );
    expect(readSkillFrontmatterName(skillMd)).toBe("lumpcode");
    expect(readFileSync(join(inspectDir, "README.md"), "utf8")).toBe(SEED_README);
    expect(readFileSync(join(inspectDir, "LICENSE"), "utf8")).toBe(SEED_LICENSE);
    expect(existsSync(join(inspectDir, "skills", "grilling"))).toBe(false);
    expect(existsSync(join(inspectDir, ".agents"))).toBe(false);

    const second = publishSkills({ repo: bareRepo });
    expect(second).toEqual({ updated: false, dryRun: false });
  });

  it("replaces destDir so stale files are removed", () => {
    const { bareRepo } = makeSkillsRemote();
    publishSkills({ repo: bareRepo });

    const workDir = cloneBare(bareRepo);
    writeFileSync(join(workDir, "skills", "lumpcode", "stale.txt"), "stale\n");
    git(["-C", workDir, "add", "skills/lumpcode/stale.txt"]);
    git(["-C", workDir, "commit", "-m", "add stale"]);
    git(["-C", workDir, "push", "origin", "HEAD:main"]);

    publishSkills({ repo: bareRepo });

    const inspectDir = cloneBare(bareRepo);
    expect(
      existsSync(join(inspectDir, "skills", "lumpcode", "stale.txt")),
    ).toBe(false);
    expect(
      existsSync(join(inspectDir, "skills", "lumpcode", "SKILL.md")),
    ).toBe(true);
  });

  function makeTempDir(prefix) {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  function makeSkillsRemote() {
    const workDir = makeTempDir("skills-work-");
    git(["init", "-b", "main", workDir]);
    git(["-C", workDir, "config", "user.name", "Lumpcode Test"]);
    git(["-C", workDir, "config", "user.email", "test@lumpcode.example"]);
    writeFileSync(join(workDir, "README.md"), SEED_README);
    writeFileSync(join(workDir, "LICENSE"), SEED_LICENSE);
    git(["-C", workDir, "add", "README.md", "LICENSE"]);
    git(["-C", workDir, "commit", "-m", "seed"]);

    const bareRepo = join(makeTempDir("skills-bare-"), "skills.git");
    git(["clone", "--bare", workDir, bareRepo]);
    const headBefore = gitCapture(["-C", bareRepo, "rev-parse", "HEAD"]);
    return { bareRepo, headBefore };
  }

  function cloneBare(bareRepo) {
    const inspectDir = makeTempDir("skills-inspect-");
    git(["clone", bareRepo, inspectDir]);
    return inspectDir;
  }
});

/**
 * @param {string[]} args
 */
function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed:\n${result.stderr || result.stdout}`,
    );
  }
  return result;
}

/**
 * @param {string[]} args
 */
function gitCapture(args) {
  return git(args).stdout.trim();
}
