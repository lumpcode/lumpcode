#!/usr/bin/env node
/**
 * Align versions across @lumpcode/core, @lumpcode/cli-types, @lumpcode/cli-utils,
 * @lumpcode/recipes, @lumpcode/cli, and lumpcode (cli-meta).
 *
 * Usage:
 *   node scripts/set-npm-versions.mjs              # print current versions
 *   node scripts/set-npm-versions.mjs 0.0.1          # set exact version (all)
 *   node scripts/set-npm-versions.mjs --patch        # bump patch (all)
 *   node scripts/set-npm-versions.mjs --minor        # bump minor (all)
 *   node scripts/set-npm-versions.mjs --major        # bump major (all)
 *   node scripts/set-npm-versions.mjs --patch --packages recipes
 *   node scripts/set-npm-versions.mjs 0.0.12 --packages core,cli
 *   node scripts/set-npm-versions.mjs 0.0.1 --no-install
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  packageSelectionHelp,
  takePackageSelection,
} from "./npm-packages.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const INTERNAL_DEP_NAMES = new Set([
  "@lumpcode/core",
  "@lumpcode/cli-types",
  "@lumpcode/cli-utils",
  "@lumpcode/recipes",
  "@lumpcode/cli",
  "lumpcode",
]);

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

function resolveVersionAction(argv) {
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

  if (positional.length === 1) {
    parseSemver(positional[0]);
    return { kind: "exact", version: positional[0] };
  }

  if (bumpFlags.length === 1) {
    return { kind: "bump", bump: bumpFlags[0].slice(2) };
  }

  return null;
}

function printUsage(packages) {
  console.log("Current publishable package versions:");
  for (const pkg of packages) {
    const { data } = readPackageJson(pkg.packageJson);
    console.log(`  ${data.name}: ${data.version}`);
  }
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/set-npm-versions.mjs <x.y.z>");
  console.log("  node scripts/set-npm-versions.mjs --patch|--minor|--major");
  console.log("");
  console.log("Options:");
  console.log(
    `  --packages <ids>  only update these packages (${packageSelectionHelp()})`
  );
  console.log("  --no-install      skip npm install after updating package.json files");
}

function targetVersionForPackage(pkg, action) {
  const { data } = readPackageJson(pkg.packageJson);
  if (action.kind === "exact") {
    return action.version;
  }
  return bumpSemver(data.version, action.bump);
}

function updatePackages(selectedPackages, action) {
  const selectedWorkspaces = new Set(
    selectedPackages.map((pkg) => pkg.workspace)
  );
  const versionByWorkspace = new Map();

  for (const pkg of selectedPackages) {
    versionByWorkspace.set(pkg.workspace, targetVersionForPackage(pkg, action));
  }

  let changed = 0;
  for (const pkg of selectedPackages) {
    const targetVersion = versionByWorkspace.get(pkg.workspace);
    const { absolutePath, data } = readPackageJson(pkg.packageJson);
    const before = JSON.stringify(data);
    const previousVersion = data.version;
    data.version = targetVersion;

    if (data.dependencies) {
      for (const depName of Object.keys(data.dependencies)) {
        if (!INTERNAL_DEP_NAMES.has(depName)) {
          continue;
        }
        if (!selectedWorkspaces.has(depName)) {
          continue;
        }
        const depVersion = versionByWorkspace.get(depName);
        if (depVersion !== undefined) {
          data.dependencies[depName] = `^${depVersion}`;
        }
      }
    }

    if (JSON.stringify(data) === before) {
      console.log(`Unchanged ${data.name} @ ${targetVersion}`);
      continue;
    }

    writePackageJson(absolutePath, data);
    if (previousVersion === targetVersion) {
      console.log(`Updated ${data.name} dependencies @ ${targetVersion}`);
    } else {
      console.log(`Updated ${data.name}: ${previousVersion} → ${targetVersion}`);
    }
    changed += 1;
  }

  return changed;
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
  const withoutNoInstall = argv.filter((arg) => arg !== "--no-install");

  let packages;
  let rest;
  let selected;
  try {
    ({ packages, rest, selected } = takePackageSelection(withoutNoInstall));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  let action;
  try {
    action = resolveVersionAction(rest);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  if (action === null) {
    printUsage(packages);
    process.exit(0);
  }

  const changed = updatePackages(packages, action);

  if (changed === 0) {
    console.log("Nothing to change.");
    process.exit(0);
  }

  if (!noInstall) {
    runNpmInstall();
  }

  const scope = selected
    ? packages.map((pkg) => pkg.id).join(", ")
    : "all publishable packages";
  console.log(`\nDone. Updated: ${scope}.`);
  console.log(
    "Publish: node scripts/publish-npm.mjs" +
      (selected ? ` --packages ${packages.map((pkg) => pkg.id).join(",")}` : "")
  );
}

main();
