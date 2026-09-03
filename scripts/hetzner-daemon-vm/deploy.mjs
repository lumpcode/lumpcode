#!/usr/bin/env node
/**
 * Provision (or reuse) a Hetzner Cloud server for a dedicated Lumpcode daemon host.
 *
 * Bootstrap scope (this script only):
 *   - ensure local SSH keypair exists (generate if missing)
 *   - optionally regenerate SSH keys (`--regen-ssh-keys`)
 *   - upload the public key to the Hetzner project
 *   - create the server if it does not exist (Ubuntu + `lumpcode` sudo user)
 *   - if the server exists and config `serverType` differs, resize in place
 *   - regenerate scripts/hetzner-daemon-vm/connect.sh with the current public IP
 *   - print how to SSH in
 *
 * Secrets stay off the repo under ~/.lumpcode/hetzner-daemon-vm/.
 *
 * Prerequisites:
 *   - `hcloud` CLI on PATH (https://github.com/hetznercloud/cli)
 *   - API token: `hcloud context create`, or `HCLOUD_TOKEN`, or a token file
 *   - `ssh-keygen` on PATH
 *
 * Usage (from repo root):
 *   npm run hetzner-daemon-vm -- --help
 *   npm run hetzner-daemon-vm
 *   npm run hetzner-daemon-vm -- --dry-run
 *   npm run hetzner-daemon-vm -- --regen-ssh-keys
 *   node scripts/hetzner-daemon-vm/deploy.mjs --help
 *
 * Non-secret config (env overrides ~/.lumpcode/hetzner-daemon-vm/config.json):
 *   LUMPCODE_HETZNER_LOCATION         (default: fsn1)
 *   LUMPCODE_HETZNER_SERVER_NAME      (default: lumpcode-daemon)
 *   LUMPCODE_HETZNER_SERVER_TYPE      (default: cx43 — 8 vCPU / 16 GB)
 *   LUMPCODE_HETZNER_IMAGE            (default: ubuntu-24.04)
 *   LUMPCODE_HETZNER_ADMIN_USERNAME   (default: lumpcode)
 *   LUMPCODE_HETZNER_SSH_KEY_NAME     (default: same as server name)
 *
 * Token (first match wins): LUMPCODE_HETZNER_TOKEN, HCLOUD_TOKEN,
 *   ~/.lumpcode/hetzner-daemon-vm/token, else the active `hcloud` context.
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
const STATE_DIR = resolve(homedir(), ".lumpcode", "hetzner-daemon-vm");
const SSH_DIR = join(STATE_DIR, "ssh");
const PRIVATE_KEY_PATH = join(SSH_DIR, "id_ed25519");
const PUBLIC_KEY_PATH = join(SSH_DIR, "id_ed25519.pub");
const CONFIG_PATH = join(STATE_DIR, "config.json");
const STATE_PATH = join(STATE_DIR, "state.json");
const TOKEN_PATH = join(STATE_DIR, "token");
const USER_DATA_PATH = join(STATE_DIR, "user-data.yaml");
/** Regenerated on each deploy with the current public IP (gitignored). */
const CONNECT_SH_PATH = join(SCRIPT_DIR, "connect.sh");

const DEFAULTS = {
  location: "fsn1",
  serverName: "lumpcode-daemon",
  serverType: "cx43",
  image: "ubuntu-24.04",
  adminUsername: "lumpcode",
  sshKeyName: undefined,
};

const LOG_PREFIX = "[hetzner-daemon-vm]";

/** Env passed to `hcloud` (may inject HCLOUD_TOKEN). */
let hcloudEnv = { ...process.env };

function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureDir(STATE_DIR);
  ensureDir(SSH_DIR);

  const config = loadConfig();
  assertHcloudAvailable();
  loadToken();
  assertHcloudAuth();

  const keyState = ensureSshKeys({ regen: args.regenSshKeys, dryRun: args.dryRun });
  ensureHcloudSshKey(config, {
    dryRun: args.dryRun,
    regen: args.regenSshKeys,
  });
  const vm = ensureServer(config, {
    dryRun: args.dryRun,
    regenSshKeys: args.regenSshKeys,
    previousPrivateKeyPath: keyState.previousPrivateKeyPath,
  });

  writeState({
    updatedAt: new Date().toISOString(),
    location: config.location,
    serverName: config.serverName,
    serverType: config.serverType,
    image: config.image,
    adminUsername: config.adminUsername,
    sshKeyName: config.sshKeyName,
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
  console.log(`Hetzner daemon VM deploy (bootstrap: server + SSH only)

What it does
  1. Ensures a local ed25519 SSH keypair (creates one if missing)
  2. Uploads the public key to the Hetzner project (named ssh-key)
  3. Creates an Ubuntu Cloud server if it does not exist
  4. Resizes in place when config serverType differs from the live server
  5. Regenerates scripts/hetzner-daemon-vm/connect.sh with the current public IP
  6. Prints an ssh command using the private key under your home dir
  It does not clone Lumpcode or start the daemon yet.

Default size is cx43 (8 vCPU / 16 GB / 160 GB) for maxParallelRun: 2.
Location cannot be changed in place — pick fsn1 / nbg1 / hel1 before first create.

Prerequisites
  - hcloud CLI on PATH: https://github.com/hetznercloud/cli
  - API token with Read & Write (Console → Security → API Tokens)
  - ssh-keygen on PATH

Auth (first match)
  LUMPCODE_HETZNER_TOKEN  env
  HCLOUD_TOKEN            env
  ${TOKEN_PATH}
  active hcloud context   (hcloud context create)

Quick start (from repo root)
  npm run hetzner-daemon-vm -- --help
  npm run hetzner-daemon-vm -- --dry-run
  npm run hetzner-daemon-vm
  ./scripts/hetzner-daemon-vm/connect.sh

npm (pass flags after --)
  npm run hetzner-daemon-vm
  npm run hetzner-daemon-vm -- --dry-run
  npm run hetzner-daemon-vm -- --regen-ssh-keys
  npm run hetzner-daemon-vm -- --help

Direct invocation
  node scripts/hetzner-daemon-vm/deploy.mjs
  node scripts/hetzner-daemon-vm/deploy.mjs --dry-run
  node scripts/hetzner-daemon-vm/deploy.mjs --regen-ssh-keys
  node scripts/hetzner-daemon-vm/deploy.mjs --help

Options
  --regen-ssh-keys  Rotate local SSH keypair (backs up previous keys under
                    ${SSH_DIR}), replace the Hetzner ssh-key resource, then
                    append the new pubkey on the server via SSH (needs the
                    previous private key)
  --dry-run         Print mutating hcloud/ssh actions; still reads live state
  -h, --help        Show this help

Config (non-secret; first run writes a starter file)
  ${CONFIG_PATH}
  Env overrides (optional):
    LUMPCODE_HETZNER_LOCATION         (default: ${DEFAULTS.location})
    LUMPCODE_HETZNER_SERVER_NAME      (default: ${DEFAULTS.serverName})
    LUMPCODE_HETZNER_SERVER_TYPE      (default: ${DEFAULTS.serverType})
    LUMPCODE_HETZNER_IMAGE            (default: ${DEFAULTS.image})
    LUMPCODE_HETZNER_ADMIN_USERNAME   (default: ${DEFAULTS.adminUsername})
    LUMPCODE_HETZNER_SSH_KEY_NAME     (default: server name)

Secrets / state (never commit; outside the repo)
  ${STATE_DIR}
    ssh/id_ed25519      private key
    ssh/id_ed25519.pub  public key
    token               optional API token (chmod 600)
    config.json         non-secret names / type / location
    state.json          last run snapshot (public IP, paths)

Generated connect helper (gitignored; rewritten on each successful deploy)
  ${CONNECT_SH_PATH}
  ./scripts/hetzner-daemon-vm/connect.sh
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
      location: DEFAULTS.location,
      serverName: DEFAULTS.serverName,
      serverType: DEFAULTS.serverType,
      image: DEFAULTS.image,
      adminUsername: DEFAULTS.adminUsername,
    };
    writeFileSync(CONFIG_PATH, `${JSON.stringify(starter, null, 2)}\n`, {
      mode: 0o600,
    });
    console.log(`${LOG_PREFIX} wrote starter config: ${CONFIG_PATH}`);
  }

  const serverName =
    process.env.LUMPCODE_HETZNER_SERVER_NAME ??
    fileConfig.serverName ??
    DEFAULTS.serverName;

  return {
    location:
      process.env.LUMPCODE_HETZNER_LOCATION ??
      fileConfig.location ??
      DEFAULTS.location,
    serverName,
    serverType:
      process.env.LUMPCODE_HETZNER_SERVER_TYPE ??
      fileConfig.serverType ??
      DEFAULTS.serverType,
    image:
      process.env.LUMPCODE_HETZNER_IMAGE ??
      fileConfig.image ??
      DEFAULTS.image,
    adminUsername:
      process.env.LUMPCODE_HETZNER_ADMIN_USERNAME ??
      fileConfig.adminUsername ??
      DEFAULTS.adminUsername,
    sshKeyName:
      process.env.LUMPCODE_HETZNER_SSH_KEY_NAME ??
      fileConfig.sshKeyName ??
      serverName,
  };
}

function loadToken() {
  const fromEnv = (
    process.env.LUMPCODE_HETZNER_TOKEN ??
    process.env.HCLOUD_TOKEN ??
    ""
  ).trim();
  if (fromEnv) {
    hcloudEnv = { ...process.env, HCLOUD_TOKEN: fromEnv };
    return;
  }
  if (!existsSync(TOKEN_PATH)) {
    return;
  }
  const fromFile = readFileSync(TOKEN_PATH, "utf8").trim();
  if (!fromFile || fromFile.startsWith("#")) {
    fail(
      `Token file ${TOKEN_PATH} is empty. Paste a Read & Write API token, or use hcloud context create.`,
    );
  }
  hcloudEnv = { ...process.env, HCLOUD_TOKEN: fromFile };
}

function ensureSshKeys({ regen, dryRun }) {
  const hasPrivate = existsSync(PRIVATE_KEY_PATH);
  const hasPublic = existsSync(PUBLIC_KEY_PATH);

  if (regen) {
    if (dryRun) {
      console.log(
        `[dry-run] would regenerate SSH keys at ${SSH_DIR} (backup existing)`,
      );
      return { previousPrivateKeyPath: undefined };
    }
    const previousPrivateKeyPath = backupExistingKeys();
    generateKeypair();
    console.log(`${LOG_PREFIX} regenerated SSH keys in ${SSH_DIR}`);
    return { previousPrivateKeyPath };
  }

  if (hasPrivate && hasPublic) {
    console.log(`${LOG_PREFIX} reusing SSH keys in ${SSH_DIR}`);
    return { previousPrivateKeyPath: undefined };
  }

  if (hasPrivate !== hasPublic) {
    fail(
      `Incomplete SSH keypair in ${SSH_DIR}. Pass --regen-ssh-keys or remove the orphaned file(s).`,
    );
  }

  if (dryRun) {
    console.log(`[dry-run] would generate SSH keys at ${SSH_DIR}`);
    return { previousPrivateKeyPath: undefined };
  }

  generateKeypair();
  console.log(`${LOG_PREFIX} generated SSH keys in ${SSH_DIR}`);
  return { previousPrivateKeyPath: undefined };
}

function backupExistingKeys() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let previousPrivateKeyPath;
  for (const path of [PRIVATE_KEY_PATH, PUBLIC_KEY_PATH]) {
    if (!existsSync(path)) continue;
    const dest = `${path}.bak.${stamp}`;
    renameSync(path, dest);
    if (path === PRIVATE_KEY_PATH) previousPrivateKeyPath = dest;
  }
  return previousPrivateKeyPath;
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
      "lumpcode-hetzner-daemon-vm",
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

function ensureHcloudSshKey(config, { dryRun, regen }) {
  const described = describeHcloudSshKey(config.sshKeyName, { dryRun: false });

  if (described && !regen) {
    console.log(`${LOG_PREFIX} Hetzner ssh-key exists: ${config.sshKeyName}`);
    return;
  }

  if (!existsSync(PUBLIC_KEY_PATH) && dryRun) {
    console.log(
      `[dry-run] would upload ssh-key ${config.sshKeyName} (public key not present yet)`,
    );
    return;
  }

  if (described && regen) {
    console.log(
      `${LOG_PREFIX} replacing Hetzner ssh-key ${config.sshKeyName}`,
    );
    runHcloud(["ssh-key", "delete", config.sshKeyName], {
      inherit: true,
      dryRun,
      mutate: true,
    });
  }

  console.log(`${LOG_PREFIX} uploading ssh-key ${config.sshKeyName}`);
  runHcloud(
    [
      "ssh-key",
      "create",
      "--name",
      config.sshKeyName,
      "--public-key-from-file",
      PUBLIC_KEY_PATH,
    ],
    { inherit: true, dryRun, mutate: true },
  );
}

function describeHcloudSshKey(name, { dryRun }) {
  const result = runHcloud(["ssh-key", "describe", name, "-o", "json"], {
    allowFailure: true,
    dryRun,
    mutate: false,
  });
  if (result.status !== 0) return null;
  try {
    const data = JSON.parse(result.stdout);
    return data.ssh_key ?? data;
  } catch {
    return null;
  }
}

function ensureServer(config, { dryRun, regenSshKeys, previousPrivateKeyPath }) {
  const live = describeServer(config.serverName, { dryRun: false });

  if (!live) {
    createServer(config, dryRun);
    const created = describeServer(config.serverName, { dryRun: false });
    const publicIp = created?.publicIp ?? null;
    if (!dryRun && publicIp) {
      waitForSsh(config, publicIp);
    }
    return { publicIp, created: true };
  }

  console.log(`${LOG_PREFIX} server already exists: ${config.serverName}`);

  if (live.serverType && live.serverType !== config.serverType) {
    resizeServer(config, live, dryRun);
  }

  if (regenSshKeys) {
    const ip = live.publicIp;
    if (!ip) {
      fail(
        `Cannot rotate SSH keys: server ${config.serverName} has no IPv4 address.`,
      );
    }
    if (!previousPrivateKeyPath && !dryRun) {
      fail(
        `Cannot rotate SSH keys on an existing server without the previous private key. Re-run without --regen-ssh-keys, or restore a backup under ${SSH_DIR}.`,
      );
    }
    updateServerAuthorizedKey(config, ip, previousPrivateKeyPath, dryRun);
  }

  const after = describeServer(config.serverName, { dryRun: false });
  return { publicIp: after?.publicIp ?? live.publicIp ?? null, created: false };
}

function createServer(config, dryRun) {
  if (!existsSync(PUBLIC_KEY_PATH) && dryRun) {
    console.log(
      `[dry-run] would create server ${config.serverName} (${config.serverType})`,
    );
    return;
  }

  writeUserData(config, dryRun);
  console.log(
    `${LOG_PREFIX} creating server ${config.serverName} (${config.serverType} @ ${config.location})`,
  );
  runHcloud(
    [
      "server",
      "create",
      "--name",
      config.serverName,
      "--type",
      config.serverType,
      "--location",
      config.location,
      "--image",
      config.image,
      "--ssh-key",
      config.sshKeyName,
      "--user-data-from-file",
      USER_DATA_PATH,
      "--label",
      "lumpcode=daemon",
    ],
    { inherit: true, dryRun, mutate: true },
  );
}

function writeUserData(config, dryRun) {
  const publicKey = dryRun
    ? "ssh-ed25519 PLACEHOLDER lumpcode-hetzner-daemon-vm"
    : readFileSync(PUBLIC_KEY_PATH, "utf8").trim();
  const body = `#cloud-config
users:
  - name: ${config.adminUsername}
    groups: [sudo]
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    lock_passwd: true
    ssh_authorized_keys:
      - ${JSON.stringify(publicKey)}
`;
  if (dryRun) {
    console.log(`[dry-run] would write cloud-init user-data to ${USER_DATA_PATH}`);
    return;
  }
  writeFileSync(USER_DATA_PATH, body, { mode: 0o600 });
}

function resizeServer(config, live, dryRun) {
  console.log(
    `${LOG_PREFIX} resizing ${config.serverName} ${live.serverType} → ${config.serverType} (server will power off)`,
  );
  runHcloud(["server", "shutdown", config.serverName], {
    inherit: true,
    dryRun,
    mutate: true,
  });
  if (!dryRun) {
    waitServerStatus(config.serverName, "off");
  }

  const changed = runHcloud(
    ["server", "change-type", config.serverName, config.serverType],
    {
      inherit: true,
      dryRun,
      mutate: true,
      allowFailure: true,
    },
  );
  if (changed.status !== 0) {
    console.log(
      `${LOG_PREFIX} change-type failed; retrying with --keep-disk (needed when the new type has a smaller disk)`,
    );
    runHcloud(
      [
        "server",
        "change-type",
        "--keep-disk",
        config.serverName,
        config.serverType,
      ],
      { inherit: true, dryRun, mutate: true },
    );
  }

  runHcloud(["server", "poweron", config.serverName], {
    inherit: true,
    dryRun,
    mutate: true,
  });
  if (!dryRun) {
    waitServerStatus(config.serverName, "running");
  }
}

function updateServerAuthorizedKey(config, publicIp, previousPrivateKeyPath, dryRun) {
  const publicKey = dryRun
    ? "<public-key>"
    : readFileSync(PUBLIC_KEY_PATH, "utf8").trim();
  const user = config.adminUsername;
  const target = `${user}@${publicIp}`;
  const remote = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && grep -qxF ${shellQuote(publicKey)} ~/.ssh/authorized_keys 2>/dev/null || echo ${shellQuote(publicKey)} >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`;

  if (dryRun) {
    console.log(
      `[dry-run] would SSH with previous key to append authorized_keys on ${target}`,
    );
    return;
  }

  console.log(`${LOG_PREFIX} appending new SSH public key on ${target}`);
  const result = spawnSync(
    "ssh",
    [
      "-i",
      previousPrivateKeyPath,
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "ConnectTimeout=15",
      target,
      remote,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    fail(
      `Could not install the new public key over SSH (tried ${target} with the previous private key).\n${result.stderr || result.stdout || "(no output)"}\nThe new local key is in ${SSH_DIR}; the server still expects the backup key.`,
    );
  }
}

function describeServer(name, { dryRun }) {
  const result = runHcloud(["server", "describe", name, "-o", "json"], {
    allowFailure: true,
    dryRun,
    mutate: false,
  });
  if (result.status !== 0) return null;
  try {
    return parseServerDescribe(result.stdout);
  } catch {
    return null;
  }
}

function parseServerDescribe(stdout) {
  const data = JSON.parse(stdout);
  const server = data.server ?? data;
  const ipv4 = server.public_net?.ipv4;
  const publicIp =
    typeof ipv4 === "string" ? ipv4 : ipv4?.ip != null ? String(ipv4.ip) : null;
  return {
    name: server.name,
    status: server.status,
    serverType: server.server_type?.name ?? null,
    publicIp,
  };
}

function waitServerStatus(name, wanted, timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const live = describeServer(name, { dryRun: false });
    if (live?.status === wanted) return live;
    spawnSync("sleep", ["2"]);
  }
  fail(`Timed out waiting for server ${name} to become ${wanted}.`);
}

function waitForSsh(config, publicIp) {
  const target = `${config.adminUsername}@${publicIp}`;
  console.log(`${LOG_PREFIX} waiting for SSH on ${target} (cloud-init may take a minute)`);
  const started = Date.now();
  const timeoutMs = 180000;
  while (Date.now() - started < timeoutMs) {
    const result = spawnSync(
      "ssh",
      [
        "-i",
        PRIVATE_KEY_PATH,
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "ConnectTimeout=5",
        target,
        "true",
      ],
      { encoding: "utf8" },
    );
    if (result.status === 0) {
      console.log(`${LOG_PREFIX} SSH is ready`);
      return;
    }
    spawnSync("sleep", ["5"]);
  }
  console.log(
    `${LOG_PREFIX} SSH not ready yet; connect.sh is written anyway. Retry in a minute (cloud-init).`,
  );
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
      `${LOG_PREFIX} skipping ${CONNECT_SH_PATH} (no public IPv4 yet)`,
    );
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] would write ${CONNECT_SH_PATH}`);
    return;
  }

  const body = `#!/usr/bin/env bash
# Generated by scripts/hetzner-daemon-vm/deploy.mjs — do not edit by hand.
# Regenerated on each deploy so the public IP stays current.
set -euo pipefail
exec ssh -i ${shellQuote(PRIVATE_KEY_PATH)} ${shellQuote(
    `${config.adminUsername}@${vm.publicIp}`,
  )} "$@"
`;

  writeFileSync(CONNECT_SH_PATH, body, { mode: 0o700 });
  console.log(`${LOG_PREFIX} wrote ${CONNECT_SH_PATH}`);
}

function printConnectHelp(config, vm) {
  console.log("");
  console.log(`${LOG_PREFIX} SSH (keys never leave this machine):`);
  console.log(`  private key: ${PRIVATE_KEY_PATH}`);
  if (vm.publicIp) {
    console.log(
      `  ssh -i ${PRIVATE_KEY_PATH} ${config.adminUsername}@${vm.publicIp}`,
    );
    console.log(`  ./scripts/hetzner-daemon-vm/connect.sh`);
  } else {
    console.log(
      `  ssh -i ${PRIVATE_KEY_PATH} ${config.adminUsername}@<public-ip>`,
    );
    console.log(
      "  (public IP not resolved yet — re-run after create, or check Hetzner Console)",
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

function assertHcloudAvailable() {
  const result = spawnSync("hcloud", ["version"], { encoding: "utf8" });
  if (result.error?.code === "ENOENT" || result.status !== 0) {
    fail(
      "`hcloud` CLI not found or not working. Install https://github.com/hetznercloud/cli (e.g. brew install hcloud).",
    );
  }
}

function assertHcloudAuth() {
  const result = runHcloud(["server", "list"], {
    allowFailure: true,
    dryRun: false,
    mutate: false,
  });
  if (result.status === 0) return;
  const detail = result.stderr || result.stdout || "(no output)";
  fail(
    `hcloud is not authenticated.\n${detail}\nCreate a Read & Write token in Hetzner Console → Security → API Tokens, then either:\n  hcloud context create lumpcode\n  echo '<token>' > ${TOKEN_PATH} && chmod 600 ${TOKEN_PATH}\n  export HCLOUD_TOKEN=...`,
  );
}

function runHcloud(
  args,
  { inherit = false, allowFailure = false, dryRun = false, mutate = false } = {},
) {
  if (dryRun && mutate) {
    console.log(`[dry-run] hcloud ${args.map(shellQuote).join(" ")}`);
    return { status: 0, stdout: "", stderr: "" };
  }

  const result = spawnSync("hcloud", args, {
    encoding: "utf8",
    env: hcloudEnv,
    stdio: inherit ? "inherit" : "pipe",
  });

  if (!allowFailure && result.status !== 0) {
    const detail = inherit
      ? "(see hcloud output above)"
      : result.stderr || result.stdout || "(no output)";
    fail(`hcloud ${args[0]} ${args[1] ?? ""} failed:\n${detail}`);
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
  console.error(`${LOG_PREFIX} ${message}`);
  process.exit(1);
}

main();
