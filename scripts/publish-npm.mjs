#!/usr/bin/env node
/**
 * Build and publish @lumpcode/core, @lumpcode/cli-types, @lumpcode/cli-utils,
 * @lumpcode/recipes, @lumpcode/cli, and lumpcode to npm
 * on the `latest` dist-tag (npm default). Does not bump versions.
 * Skips publish when the package version is already on the registry.
 *
 * Usage:
 *   node scripts/publish-npm.mjs                      # build + publish all
 *   node scripts/publish-npm.mjs --dry-run             # build + npm pack only
 *   node scripts/publish-npm.mjs --packages recipes
 *   node scripts/publish-npm.mjs --packages core,cli --dry-run
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  packageSelectionHelp,
  packagesNeededForBuild,
  takePackageSelection,
} from "./npm-packages.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

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

function getLocalVersion({ packageJson, workspace }) {
  const data = JSON.parse(readFileSync(resolve(repoRoot, packageJson), "utf8"));
  if (typeof data.version !== "string" || !data.version) {
    console.error(`Missing version in ${packageJson} (${workspace})`);
    process.exit(1);
  }
  return data.version;
}

function getRegistryPackageName({ packageJson, workspace }) {
  const data = JSON.parse(readFileSync(resolve(repoRoot, packageJson), "utf8"));
  return typeof data.name === "string" && data.name ? data.name : workspace;
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

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/publish-npm.mjs [--dry-run] [--packages <ids>]");
  console.log("");
  console.log("Options:");
  console.log("  --dry-run         build + npm pack only (no publish)");
  console.log(
    `  --packages <ids>  only publish these packages (${packageSelectionHelp()})`
  );
  console.log("                    Builds selected packages plus their build deps.");
}

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  printUsage();
  process.exit(0);
}

const dryRun = argv.includes("--dry-run");
const withoutDryRun = argv.filter((arg) => arg !== "--dry-run");

let packages;
let rest;
let selected;
try {
  ({ packages, rest, selected } = takePackageSelection(withoutDryRun));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

if (rest.length > 0) {
  console.error(`Unknown argument(s): ${rest.join(" ")}`);
  printUsage();
  process.exit(1);
}

if (!dryRun) {
  const whoami = npm(["whoami"]);
  if (whoami.status !== 0 || !whoami.stdout?.trim()) {
    console.error("npm whoami failed — run npm login first");
    process.exit(1);
  }
  console.log(`Publishing as npm user: ${whoami.stdout.trim()}`);
}

if (selected) {
  console.log(
    `Package selection: ${packages.map((pkg) => pkg.workspace).join(", ")}`
  );
}

const buildPackages = packagesNeededForBuild(packages);
for (const pkg of buildPackages) {
  if (!pkg.buildScript) {
    continue;
  }
  console.log(`Building ${pkg.workspace}...`);
  npmRun(["run", pkg.buildScript, `-w=${pkg.workspace}`]);
}

if (dryRun) {
  console.log("Dry run — packing tarballs (no publish):");
  for (const pkg of packages) {
    npmRun(["pack", `-w=${pkg.workspace}`]);
  }
  console.log("Done. Inspect *.tgz in the repo root.");
  process.exit(0);
}

const published = [];
const skipped = [];

for (const pkg of packages) {
  const packageName = getRegistryPackageName(pkg);
  const version = getLocalVersion(pkg);

  if (isVersionPublishedOnRegistry(packageName, version)) {
    console.log(`Skip ${packageName}@${version} — already on npm`);
    skipped.push(`${packageName}@${version}`);
    continue;
  }

  console.log(`Publishing ${packageName}@${version} (latest)...`);
  npmRun(["publish", `-w=${pkg.workspace}`, "--access", "public"]);
  published.push(`${packageName}@${version}`);
}

console.log("");
if (published.length > 0) {
  console.log(`Published: ${published.join(", ")}`);
  console.log("\nInstall with:");
  console.log("  npm i -g @lumpcode/cli");
  console.log("  npm i -D @lumpcode/cli-types");
  console.log("  npm i @lumpcode/cli-utils");
  console.log("  npm i @lumpcode/recipes");
  console.log("  (optional alias package lumpcode also published for npm i -g lumpcode)");
} else {
  console.log("Nothing published — all package versions are already on npm.");
}

if (skipped.length > 0) {
  console.log(`Skipped: ${skipped.join(", ")}`);
}
