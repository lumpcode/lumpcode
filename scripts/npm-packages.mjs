/**
 * Canonical publishable package list and CLI selection helpers
 * for set-npm-versions.mjs / publish-npm.mjs.
 */

export const PUBLISHABLE_PACKAGES = [
  {
    id: "core",
    workspace: "@lumpcode/core",
    packageJson: "packages/core/package.json",
    aliases: ["core", "@lumpcode/core"],
    buildScript: "build",
    buildDeps: [],
  },
  {
    id: "cli-types",
    workspace: "@lumpcode/cli-types",
    packageJson: "packages/apps/cli/cli-types/package.json",
    aliases: ["cli-types", "@lumpcode/cli-types"],
    buildScript: "build",
    buildDeps: ["@lumpcode/core"],
  },
  {
    id: "cli-utils",
    workspace: "@lumpcode/cli-utils",
    packageJson: "packages/apps/cli/cli-utils/package.json",
    aliases: ["cli-utils", "utils", "@lumpcode/cli-utils"],
    buildScript: "build",
    buildDeps: ["@lumpcode/core", "@lumpcode/cli-types"],
  },
  {
    id: "recipes",
    workspace: "@lumpcode/recipes",
    packageJson: "packages/recipes/package.json",
    aliases: ["recipes", "@lumpcode/recipes"],
    buildScript: "build",
    buildDeps: ["@lumpcode/core", "@lumpcode/cli-utils"],
  },
  {
    id: "cli",
    workspace: "@lumpcode/cli",
    packageJson: "packages/apps/cli/package.json",
    aliases: ["cli", "@lumpcode/cli"],
    buildScript: "build:bundle",
    buildDeps: ["@lumpcode/core"],
  },
  {
    id: "lumpcode",
    workspace: "lumpcode",
    packageJson: "packages/apps/cli-meta/package.json",
    aliases: ["lumpcode", "cli-meta", "meta"],
    buildScript: null,
    buildDeps: [],
  },
];

const ALIAS_TO_PACKAGE = new Map();
for (const pkg of PUBLISHABLE_PACKAGES) {
  for (const alias of pkg.aliases) {
    ALIAS_TO_PACKAGE.set(alias.toLowerCase(), pkg);
  }
}

export function packageSelectionHelp() {
  return PUBLISHABLE_PACKAGES.map((pkg) => pkg.id).join(", ");
}

/**
 * Pull `--packages` / `--package` and `--ignore-packages` / `--ignore-package`
 * from argv. Accepts comma-separated values and repeated flags.
 * Returns remaining argv and resolved package entries (all when `--packages`
 * is omitted, then filtered by ignore list).
 */
export function takePackageSelection(argv) {
  const selectedIds = [];
  const ignoredIds = [];
  const rest = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--packages" || arg === "--package") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value (e.g. --packages core,cli)`);
      }
      selectedIds.push(...splitPackageIds(value));
      i += 1;
      continue;
    }
    if (arg.startsWith("--packages=") || arg.startsWith("--package=")) {
      selectedIds.push(...splitPackageIds(arg.slice(arg.indexOf("=") + 1)));
      continue;
    }
    if (arg === "--ignore-packages" || arg === "--ignore-package") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(
          `${arg} requires a value (e.g. --ignore-packages lumpcode)`
        );
      }
      ignoredIds.push(...splitPackageIds(value));
      i += 1;
      continue;
    }
    if (
      arg.startsWith("--ignore-packages=") ||
      arg.startsWith("--ignore-package=")
    ) {
      ignoredIds.push(...splitPackageIds(arg.slice(arg.indexOf("=") + 1)));
      continue;
    }
    rest.push(arg);
  }

  let packages =
    selectedIds.length === 0
      ? [...PUBLISHABLE_PACKAGES]
      : resolvePackageSelection(selectedIds);

  if (ignoredIds.length > 0) {
    const ignored = new Set(
      resolvePackageSelection(ignoredIds).map((pkg) => pkg.workspace)
    );
    packages = packages.filter((pkg) => !ignored.has(pkg.workspace));
    if (packages.length === 0) {
      throw new Error(
        "No packages left to process after --packages / --ignore-packages"
      );
    }
  }

  return {
    packages,
    rest,
    selected: selectedIds.length > 0,
    ignored: ignoredIds.length > 0,
  };
}

function splitPackageIds(value) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolvePackageSelection(ids) {
  const seen = new Set();
  const resolved = [];

  for (const id of ids) {
    const pkg = ALIAS_TO_PACKAGE.get(id.toLowerCase());
    if (!pkg) {
      throw new Error(
        `Unknown package "${id}". Use: ${packageSelectionHelp()}`
      );
    }
    if (seen.has(pkg.workspace)) {
      continue;
    }
    seen.add(pkg.workspace);
    resolved.push(pkg);
  }

  return PUBLISHABLE_PACKAGES.filter((pkg) => seen.has(pkg.workspace));
}

/** Selected packages plus transitive build dependencies, in publish order. */
export function packagesNeededForBuild(selectedPackages) {
  const byWorkspace = new Map(
    PUBLISHABLE_PACKAGES.map((pkg) => [pkg.workspace, pkg])
  );
  const needed = new Set();

  function addWithDeps(pkg) {
    if (needed.has(pkg.workspace)) {
      return;
    }
    for (const depWorkspace of pkg.buildDeps) {
      const dep = byWorkspace.get(depWorkspace);
      if (dep) {
        addWithDeps(dep);
      }
    }
    needed.add(pkg.workspace);
  }

  for (const pkg of selectedPackages) {
    addWithDeps(pkg);
  }

  return PUBLISHABLE_PACKAGES.filter((pkg) => needed.has(pkg.workspace));
}
