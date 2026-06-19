#!/usr/bin/env node
/**
 * Align versions across @lumpcode/core, @lumpcode/cli-types, and @lumpcode/cli.
 *
 * Usage:
 *   node scripts/set-npm-versions.mjs              # print current versions
 *   node scripts/set-npm-versions.mjs 0.0.1          # set exact version
 *   node scripts/set-npm-versions.mjs --patch        # bump patch
 *   node scripts/set-npm-versions.mjs --minor        # bump minor
 *   node scripts/set-npm-versions.mjs --major        # bump major
 *   node scripts/set-npm-versions.mjs 0.0.1 --no-install
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const PACKAGE_PATHS = [
  "packages/core/package.json",
  "packages/apps/cli/cli-types/package.json",
  "packages/apps/cli/package.json",
];

function readPackageJson(relativePath) {
  const absolutePath = resolve(repoRoot, relativePath);
  return {
    absolutePath,
    data: JSON.parse(readFileSync(absolutePath, "utf8")),
  };
}

function writePackageJson(absolutePath, data) {
  writeFileSync(absolutePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid semver (expected x.y.z): ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function formatSemver({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

function bumpSemver(version, kind) {
  const parts = parseSemver(version);
  if (kind === "patch") {
    parts.patch += 1;
  } else if (kind === "minor") {
    parts.minor += 1;
    parts.patch = 0;
  } else if (kind === "major") {
    parts.major += 1;
    parts.minor = 0;
    parts.patch = 0;
  } else {
    throw new Error(`Unknown bump kind: ${kind}`);
  }
  return formatSemver(parts);
}

function resolveTargetVersion(argv) {
  const flags = argv.filter((arg) => arg.startsWith("--"));
  const positional = argv.filter((arg) => !arg.startsWith("--"));

  const bumpFlags = flags.filter((flag) =>
    ["--patch", "--minor", "--major"].includes(flag)
  );

  if (bumpFlags.length > 1) {
    throw new Error("Use only one of --patch, --minor, or --major");
  }

  if (positional.length > 1) {
    throw new Error("Pass at most one explicit version (x.y.z)");
  }

  const { data: corePkg } = readPackageJson(PACKAGE_PATHS[0]);
  const currentVersion = corePkg.version;

  if (positional.length === 1) {
    parseSemver(positional[0]);
    return positional[0];
  }

  if (bumpFlags.length === 1) {
    return bumpSemver(currentVersion, bumpFlags[0].slice(2));
  }

  return null;
}

function printUsage(currentVersion) {
  console.log(`Current @lumpcode/* version: ${currentVersion}`);
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/set-npm-versions.mjs <x.y.z>");
  console.log("  node scripts/set-npm-versions.mjs --patch|--minor|--major");
  console.log("");
  console.log("Options:");
  console.log("  --no-install   skip npm install after updating package.json files");
}

function updatePackages(targetVersion) {
  for (const relativePath of PACKAGE_PATHS) {
    const { absolutePath, data } = readPackageJson(relativePath);
    data.version = targetVersion;
    if (data.dependencies?.["@lumpcode/core"] !== undefined) {
      data.dependencies["@lumpcode/core"] = `^${targetVersion}`;
    }
    writePackageJson(absolutePath, data);
    console.log(`Updated ${data.name} → ${targetVersion}`);
  }
}

function runNpmInstall() {
  console.log("Running npm install to sync package-lock.json...");
  const result = spawnSync("npm", ["install"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const noInstall = argv.includes("--no-install");
  const filteredArgv = argv.filter((arg) => arg !== "--no-install");

  let targetVersion;
  try {
    targetVersion = resolveTargetVersion(filteredArgv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const { data: corePkg } = readPackageJson(PACKAGE_PATHS[0]);

  if (targetVersion === null) {
    printUsage(corePkg.version);
    process.exit(0);
  }

  if (targetVersion === corePkg.version) {
    console.log(`Version already ${targetVersion}; nothing to change.`);
    process.exit(0);
  }

  updatePackages(targetVersion);

  if (!noInstall) {
    runNpmInstall();
  }

  console.log(`\nDone. All three packages are at ${targetVersion}.`);
  console.log("Publish: node scripts/publish-npm.mjs (order: core → cli-types → cli)");
}

main();
