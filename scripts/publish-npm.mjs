#!/usr/bin/env node
/**
 * Build and publish @lumpcode/core, @lumpcode/cli-types, @lumpcode/cli, and lumpcode to npm
 * on the `latest` dist-tag (npm default). Does not bump versions.
 * Skips publish when the package version is already on the registry.
 *
 * Usage:
 *   node scripts/publish-npm.mjs           # build + publish
 *   node scripts/publish-npm.mjs --dry-run # build + npm pack only
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");

const packages = [
  "@lumpcode/core",
  "@lumpcode/cli-types",
  "@lumpcode/cli",
  "lumpcode",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function npm(args, options = {}) {
  return spawnSync("npm", args, {
    cwd: repoRoot,
    stdio: options.inherit ? "inherit" : "pipe",
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options,
  });
}

function npmRun(args) {
  const result = npm(args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getLocalVersion(workspace) {
  const result = npm(["pkg", "get", "version", `-w=${workspace}`]);
  if (result.status !== 0) {
    console.error(`Failed to read version for ${workspace}`);
    process.exit(1);
  }
  return JSON.parse(result.stdout.trim());
}

function isVersionPublishedOnRegistry(packageName, version) {
  const result = npm(["view", `${packageName}@${version}`, "version", "--json"]);
  if (result.status !== 0) {
    return false;
  }

  const text = result.stdout.trim();
  if (!text) {
    return false;
  }

  try {
    const value = JSON.parse(text);
    if (Array.isArray(value)) {
      return value.includes(version);
    }
    return String(value) === version;
  } catch {
    return text.replace(/^"|"$/g, "") === version;
  }
}

if (!dryRun) {
  const whoami = npm(["whoami"]);
  if (whoami.status !== 0 || !whoami.stdout?.trim()) {
    console.error("npm whoami failed — run npm login first");
    process.exit(1);
  }
  console.log(`Publishing as npm user: ${whoami.stdout.trim()}`);
}

console.log("Building @lumpcode/core...");
npmRun(["run", "build", "-w=@lumpcode/core"]);

console.log("Building @lumpcode/cli-types...");
npmRun(["run", "build", "-w=@lumpcode/cli-types"]);

console.log("Building @lumpcode/cli bundle...");
npmRun(["run", "build:bundle", "-w=@lumpcode/cli"]);

if (dryRun) {
  console.log("Dry run — packing tarballs (no publish):");
  for (const pkg of packages) {
    npmRun(["pack", `-w=${pkg}`]);
  }
  console.log("Done. Inspect *.tgz in the repo root.");
  process.exit(0);
}

const published = [];
const skipped = [];

for (const pkg of packages) {
  const version = getLocalVersion(pkg);

  if (isVersionPublishedOnRegistry(pkg, version)) {
    console.log(`Skip ${pkg}@${version} — already on npm`);
    skipped.push(`${pkg}@${version}`);
    continue;
  }

  console.log(`Publishing ${pkg}@${version} (latest)...`);
  npmRun(["publish", `-w=${pkg}`, "--access", "public"]);
  published.push(`${pkg}@${version}`);
}

console.log("");
if (published.length > 0) {
  console.log(`Published: ${published.join(", ")}`);
  console.log("\nInstall with:");
  console.log("  npm i -g @lumpcode/cli");
  console.log("  npm i -D @lumpcode/cli-types");
  console.log("  (optional alias package lumpcode also published for npm i -g lumpcode)");
} else {
  console.log("Nothing published — all package versions are already on npm.");
}

if (skipped.length > 0) {
  console.log(`Skipped: ${skipped.join(", ")}`);
}
