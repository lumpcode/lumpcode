#!/usr/bin/env node
/**
 * Provision (or reuse) an Azure VM for a dedicated Lumpcode daemon host.
 *
 * Bootstrap scope (this script only):
 *   - ensure local SSH keypair exists (generate if missing)
 *   - optionally regenerate SSH keys (`--regen-ssh-keys`)
 *   - create the Azure VM if it does not exist
 *   - regenerate scripts/azure-daemon-vm/connect.sh with the current public IP
 *   - print how to SSH in
 *
 * Secrets stay off the repo under ~/.lumpcode/azure-daemon-vm/.
 *
 * Prerequisites:
 *   - `az` CLI installed and logged in (`az login`)
 *   - `ssh-keygen` on PATH
 *
 * Usage (from repo root):
 *   npm run azure-daemon-vm -- --help
 *   npm run azure-daemon-vm
 *   npm run azure-daemon-vm -- --dry-run
 *   npm run azure-daemon-vm -- --regen-ssh-keys
 *   node scripts/azure-daemon-vm/deploy.mjs --help
 *
 * Non-secret config (env overrides ~/.lumpcode/azure-daemon-vm/config.json):
 *   LUMPCODE_AZURE_RESOURCE_GROUP   (default: lumpcode-daemon)
 *   LUMPCODE_AZURE_LOCATION         (default: westeurope)
 *   LUMPCODE_AZURE_VM_NAME          (default: lumpcode-daemon)
 *   LUMPCODE_AZURE_ADMIN_USERNAME   (default: lumpcode)
 *   LUMPCODE_AZURE_VM_SIZE          (default: Standard_B2s)
 *   LUMPCODE_AZURE_SUBSCRIPTION_ID  (optional; uses current az account)
 */

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = resolve(homedir(), ".lumpcode", "azure-daemon-vm");
const SSH_DIR = join(STATE_DIR, "ssh");
const PRIVATE_KEY_PATH = join(SSH_DIR, "id_ed25519");
const PUBLIC_KEY_PATH = join(SSH_DIR, "id_ed25519.pub");
const CONFIG_PATH = join(STATE_DIR, "config.json");
const STATE_PATH = join(STATE_DIR, "state.json");
/** Regenerated on each deploy with the current public IP (gitignored). */
const CONNECT_SH_PATH = join(SCRIPT_DIR, "connect.sh");

const DEFAULTS = {
  resourceGroup: "lumpcode-daemon",
  location: "westeurope",
  vmName: "lumpcode-daemon",
  adminUsername: "lumpcode",
  vmSize: "Standard_B2s",
  subscriptionId: undefined,
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureDir(STATE_DIR);
  ensureDir(SSH_DIR);

  const config = loadConfig();
  assertAzAvailable();

  if (config.subscriptionId) {
    runAz(["account", "set", "--subscription", config.subscriptionId], {
      inherit: true,
      dryRun: args.dryRun,
    });
  }

  ensureSshKeys({ regen: args.regenSshKeys, dryRun: args.dryRun });
  ensureResourceGroup(config, args.dryRun);
  const vm = ensureVm(config, {
    dryRun: args.dryRun,
    regenSshKeys: args.regenSshKeys,
  });

  writeState({
    updatedAt: new Date().toISOString(),
    resourceGroup: config.resourceGroup,
    vmName: config.vmName,
    adminUsername: config.adminUsername,
    publicIp: vm.publicIp ?? null,
    privateKeyPath: PRIVATE_KEY_PATH,
    connectShPath: CONNECT_SH_PATH,
  });

  writeConnectSh(config, vm, args.dryRun);
  printConnectHelp(config, vm);
}

function parseArgs(argv) {
  const out = { regenSshKeys: false, dryRun: false };
  for (const arg of argv) {
    switch (arg) {
      case "--regen-ssh-keys":
        out.regenSshKeys = true;
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        fail(`Unknown argument: ${arg}\n\nRun with --help for usage.`);
    }
  }
  return out;
}

function printHelp() {
  console.log(`Azure daemon VM deploy (bootstrap: VM + SSH only)

What it does
  1. Ensures a local ed25519 SSH keypair (creates one if missing)
  2. Creates the Azure resource group + Ubuntu VM if they do not exist
  3. Regenerates scripts/azure-daemon-vm/connect.sh with the current public IP
  4. Prints an ssh command using the private key under your home dir
  It does not clone Lumpcode or start the daemon yet.

Prerequisites
  - Azure CLI on PATH (\`az\`) and logged in: az login
  - ssh-keygen on PATH

Quick start (from repo root)
  npm run azure-daemon-vm -- --help
  az login
  npm run azure-daemon-vm -- --dry-run    # preview az / key actions
  npm run azure-daemon-vm                 # create or reuse VM + keys
  ./scripts/azure-daemon-vm/connect.sh    # SSH in (after deploy)

npm (pass flags after --)
  npm run azure-daemon-vm
  npm run azure-daemon-vm -- --dry-run
  npm run azure-daemon-vm -- --regen-ssh-keys
  npm run azure-daemon-vm -- --help

Direct invocation
  node scripts/azure-daemon-vm/deploy.mjs
  node scripts/azure-daemon-vm/deploy.mjs --dry-run
  node scripts/azure-daemon-vm/deploy.mjs --regen-ssh-keys
  node scripts/azure-daemon-vm/deploy.mjs --help

Options
  --regen-ssh-keys  Rotate local SSH keypair (backs up previous keys under
                    ${SSH_DIR}), then update the VM authorized_keys if the
                    VM already exists
  --dry-run         Print actions without changing local keys or Azure
  -h, --help        Show this help

Config (non-secret; first run writes a starter file)
  ${CONFIG_PATH}
  Env overrides (optional):
    LUMPCODE_AZURE_RESOURCE_GROUP   (default: ${DEFAULTS.resourceGroup})
    LUMPCODE_AZURE_LOCATION         (default: ${DEFAULTS.location})
    LUMPCODE_AZURE_VM_NAME          (default: ${DEFAULTS.vmName})
    LUMPCODE_AZURE_ADMIN_USERNAME   (default: ${DEFAULTS.adminUsername})
    LUMPCODE_AZURE_VM_SIZE          (default: ${DEFAULTS.vmSize})
    LUMPCODE_AZURE_SUBSCRIPTION_ID  (optional; else current az account)

Secrets / state (never commit; outside the repo)
  ${STATE_DIR}
    ssh/id_ed25519      private key
    ssh/id_ed25519.pub  public key
    config.json         non-secret Azure names / size / region
    state.json          last run snapshot (public IP, paths)

Generated connect helper (gitignored; rewritten on each successful deploy)
  ${CONNECT_SH_PATH}
  ./scripts/azure-daemon-vm/connect.sh
`);
}

function loadConfig() {
  let fileConfig = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    } catch (err) {
      fail(`Failed to parse ${CONFIG_PATH}: ${err.message}`);
    }
  } else {
    const starter = {
      resourceGroup: DEFAULTS.resourceGroup,
      location: DEFAULTS.location,
      vmName: DEFAULTS.vmName,
      adminUsername: DEFAULTS.adminUsername,
      vmSize: DEFAULTS.vmSize,
      // subscriptionId: "00000000-0000-0000-0000-000000000000",
    };
    writeFileSync(CONFIG_PATH, `${JSON.stringify(starter, null, 2)}\n`, {
      mode: 0o600,
    });
    console.log(`[azure-daemon-vm] wrote starter config: ${CONFIG_PATH}`);
  }

  return {
    resourceGroup:
      process.env.LUMPCODE_AZURE_RESOURCE_GROUP ??
      fileConfig.resourceGroup ??
      DEFAULTS.resourceGroup,
    location:
      process.env.LUMPCODE_AZURE_LOCATION ??
      fileConfig.location ??
      DEFAULTS.location,
    vmName:
      process.env.LUMPCODE_AZURE_VM_NAME ??
      fileConfig.vmName ??
      DEFAULTS.vmName,
    adminUsername:
      process.env.LUMPCODE_AZURE_ADMIN_USERNAME ??
      fileConfig.adminUsername ??
      DEFAULTS.adminUsername,
    vmSize:
      process.env.LUMPCODE_AZURE_VM_SIZE ??
      fileConfig.vmSize ??
      DEFAULTS.vmSize,
    subscriptionId:
      process.env.LUMPCODE_AZURE_SUBSCRIPTION_ID ??
      fileConfig.subscriptionId ??
      DEFAULTS.subscriptionId,
  };
}

function ensureSshKeys({ regen, dryRun }) {
  const hasPrivate = existsSync(PRIVATE_KEY_PATH);
  const hasPublic = existsSync(PUBLIC_KEY_PATH);

  if (regen) {
    if (dryRun) {
      console.log(
        `[dry-run] would regenerate SSH keys at ${SSH_DIR} (backup existing)`,
      );
      return;
    }
    backupExistingKeys();
    generateKeypair();
    console.log(`[azure-daemon-vm] regenerated SSH keys in ${SSH_DIR}`);
    return;
  }

  if (hasPrivate && hasPublic) {
    console.log(`[azure-daemon-vm] reusing SSH keys in ${SSH_DIR}`);
    return;
  }

  if (hasPrivate !== hasPublic) {
    fail(
      `Incomplete SSH keypair in ${SSH_DIR}. Pass --regen-ssh-keys or remove the orphaned file(s).`,
    );
  }

  if (dryRun) {
    console.log(`[dry-run] would generate SSH keys at ${SSH_DIR}`);
    return;
  }

  generateKeypair();
  console.log(`[azure-daemon-vm] generated SSH keys in ${SSH_DIR}`);
}

function backupExistingKeys() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (const path of [PRIVATE_KEY_PATH, PUBLIC_KEY_PATH]) {
    if (!existsSync(path)) continue;
    renameSync(path, `${path}.bak.${stamp}`);
  }
}

function generateKeypair() {
  const result = spawnSync(
    "ssh-keygen",
    [
      "-t",
      "ed25519",
      "-N",
      "",
      "-C",
      "lumpcode-azure-daemon-vm",
      "-f",
      PRIVATE_KEY_PATH,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    fail(
      `ssh-keygen failed:\n${result.stderr || result.stdout || "(no output)"}`,
    );
  }
  chmodSync(PRIVATE_KEY_PATH, 0o600);
  chmodSync(PUBLIC_KEY_PATH, 0o644);
}

function ensureResourceGroup(config, dryRun) {
  const show = runAz(
    [
      "group",
      "show",
      "--name",
      config.resourceGroup,
      "--query",
      "name",
      "-o",
      "tsv",
    ],
    { allowFailure: true },
  );

  if (show.status === 0 && show.stdout.trim()) {
    console.log(
      `[azure-daemon-vm] resource group exists: ${config.resourceGroup}`,
    );
    return;
  }

  console.log(
    `[azure-daemon-vm] creating resource group ${config.resourceGroup} in ${config.location}`,
  );
  runAz(
    [
      "group",
      "create",
      "--name",
      config.resourceGroup,
      "--location",
      config.location,
    ],
    { inherit: true, dryRun },
  );
}

function ensureVm(config, { dryRun, regenSshKeys }) {
  const show = runAz(
    [
      "vm",
      "show",
      "--resource-group",
      config.resourceGroup,
      "--name",
      config.vmName,
      "--query",
      "name",
      "-o",
      "tsv",
    ],
    { allowFailure: true },
  );

  const exists = show.status === 0 && show.stdout.trim() === config.vmName;

  if (!exists) {
    if (!existsSync(PUBLIC_KEY_PATH) && dryRun) {
      console.log(
        `[dry-run] would create VM ${config.vmName} (public key not present yet)`,
      );
      return { publicIp: null, created: true };
    }

    const publicKey = dryRun
      ? "<public-key>"
      : readFileSync(PUBLIC_KEY_PATH, "utf8").trim();

    console.log(
      `[azure-daemon-vm] creating VM ${config.vmName} (${config.vmSize})`,
    );
    runAz(
      [
        "vm",
        "create",
        "--resource-group",
        config.resourceGroup,
        "--name",
        config.vmName,
        "--image",
        "Ubuntu2204",
        "--size",
        config.vmSize,
        "--admin-username",
        config.adminUsername,
        "--ssh-key-values",
        publicKey,
        "--public-ip-sku",
        "Standard",
        "--nsg-rule",
        "SSH",
        "--output",
        "none",
      ],
      { inherit: true, dryRun },
    );
  } else {
    console.log(`[azure-daemon-vm] VM already exists: ${config.vmName}`);
    if (regenSshKeys) {
      updateVmAuthorizedKey(config, dryRun);
    }
  }

  const publicIp = resolvePublicIp(config, dryRun);
  return { publicIp, created: !exists };
}

function updateVmAuthorizedKey(config, dryRun) {
  if (!existsSync(PUBLIC_KEY_PATH) && dryRun) {
    console.log(
      `[dry-run] would update VM authorized_keys with new public key`,
    );
    return;
  }
  const publicKey = dryRun
    ? "<public-key>"
    : readFileSync(PUBLIC_KEY_PATH, "utf8").trim();

  console.log(
    `[azure-daemon-vm] updating SSH public key on VM ${config.vmName}`,
  );
  runAz(
    [
      "vm",
      "user",
      "update",
      "--resource-group",
      config.resourceGroup,
      "--name",
      config.vmName,
      "--username",
      config.adminUsername,
      "--ssh-key-value",
      publicKey,
    ],
    { inherit: true, dryRun },
  );
}

function resolvePublicIp(config, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] would resolve public IP for ${config.vmName}`);
    return null;
  }
  const result = runAz(
    [
      "vm",
      "list-ip-addresses",
      "--resource-group",
      config.resourceGroup,
      "--name",
      config.vmName,
      "--query",
      "[0].virtualMachine.network.publicIpAddresses[0].ipAddress",
      "-o",
      "tsv",
    ],
    { allowFailure: true },
  );
  const ip = result.stdout.trim();
  return ip || null;
}

function writeConnectSh(config, vm, dryRun) {
  if (!vm.publicIp) {
    if (dryRun) {
      console.log(
        `[dry-run] would write ${CONNECT_SH_PATH} after public IP is known`,
      );
      return;
    }
    console.log(
      `[azure-daemon-vm] skipping ${CONNECT_SH_PATH} (no public IP yet)`,
    );
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] would write ${CONNECT_SH_PATH}`);
    return;
  }

  const body = `#!/usr/bin/env bash
# Generated by scripts/azure-daemon-vm/deploy.mjs — do not edit by hand.
# Regenerated on each deploy so the public IP stays current.
set -euo pipefail
exec ssh -i ${shellQuote(PRIVATE_KEY_PATH)} ${shellQuote(
    `${config.adminUsername}@${vm.publicIp}`,
  )} "$@"
`;

  writeFileSync(CONNECT_SH_PATH, body, { mode: 0o700 });
  console.log(`[azure-daemon-vm] wrote ${CONNECT_SH_PATH}`);
}

function printConnectHelp(config, vm) {
  console.log("");
  console.log("[azure-daemon-vm] SSH (keys never leave this machine):");
  console.log(`  private key: ${PRIVATE_KEY_PATH}`);
  if (vm.publicIp) {
    console.log(
      `  ssh -i ${PRIVATE_KEY_PATH} ${config.adminUsername}@${vm.publicIp}`,
    );
    console.log(`  ./scripts/azure-daemon-vm/connect.sh`);
  } else {
    console.log(
      `  ssh -i ${PRIVATE_KEY_PATH} ${config.adminUsername}@<public-ip>`,
    );
    console.log(
      "  (public IP not resolved yet — re-run after create, or check Azure portal)",
    );
  }
  console.log("");
  console.log(
    "Next (not in this bootstrap): clone Lumpcode on the VM, project-setup dedicated mode, start daemon.",
  );
}

function writeState(state) {
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
}

function assertAzAvailable() {
  const result = spawnSync("az", ["version", "-o", "none"], {
    encoding: "utf8",
  });
  if (result.error?.code === "ENOENT" || result.status !== 0) {
    fail(
      "`az` CLI not found or not working. Install Azure CLI and run `az login`.",
    );
  }
}

function runAz(
  args,
  { inherit = false, allowFailure = false, dryRun = false } = {},
) {
  if (dryRun) {
    console.log(`[dry-run] az ${args.map(shellQuote).join(" ")}`);
    return { status: 0, stdout: "", stderr: "" };
  }

  const result = spawnSync("az", args, {
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
  });

  if (!allowFailure && result.status !== 0) {
    const detail = inherit
      ? "(see az output above)"
      : result.stderr || result.stdout || "(no output)";
    fail(`az ${args[0]} ${args[1] ?? ""} failed:\n${detail}`);
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@%=+-]+$/.test(value)) return value;
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
}

function fail(message) {
  console.error(`[azure-daemon-vm] ${message}`);
  process.exit(1);
}

main();
