#!/usr/bin/env node
/**
 * Build and publish @lumpcode/core, @lumpcode/cli-types, and @lumpcode/cli to npm
 * on the `latest` dist-tag (npm default). Does not bump versions.
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

function npm(args) {
  run("npm", args);
}

if (!dryRun) {
  const whoami = spawnSync("npm", ["whoami"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (whoami.status !== 0 || !whoami.stdout?.trim()) {
    console.error("npm whoami failed — run npm login first");
    process.exit(1);
  }
  console.log(`Publishing as npm user: ${whoami.stdout.trim()}`);
}

console.log("Building @lumpcode/core...");
npm(["run", "build", "-w=@lumpcode/core"]);

console.log("Building @lumpcode/cli-types...");
npm(["run", "build", "-w=@lumpcode/cli-types"]);

console.log("Building @lumpcode/cli bundle...");
npm(["run", "build:bundle", "-w=@lumpcode/cli"]);

const packages = [
  "@lumpcode/core",
  "@lumpcode/cli-types",
  "@lumpcode/cli",
];

if (dryRun) {
  console.log("Dry run — packing tarballs (no publish):");
  for (const pkg of packages) {
    npm(["pack", `-w=${pkg}`]);
  }
  console.log("Done. Inspect *.tgz in the repo root.");
  process.exit(0);
}

for (const pkg of packages) {
  console.log(`Publishing ${pkg} (latest)...`);
  npm(["publish", `-w=${pkg}`, "--access", "public"]);
}

console.log("\nPublished. Install with:");
console.log("  npm i -g @lumpcode/cli");
console.log("  npm i -D @lumpcode/cli-types");
