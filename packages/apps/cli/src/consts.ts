import * as path from 'node:path';
import * as os from 'node:os';

export const AUTH_FILE_PATH = path.join(os.homedir(), '.lumpcode', 'auth.json');

/** Default cron for `lumpcode start` and adopted start-daemons. */
export const DEFAULT_DAEMON_CRON_SETUP = '*/5 * * * *';

export const REFS_HEADS_PREFIX = "refs/heads/";

export const LUMP_BRANCH_PREFIX = "lump/";
export const LUMP_COMMIT_PREFIX = "LUMP: ";

/** Lock-holder label for daemon discovery scans (not a real lump name). */
export const DISCOVERY_SCAN_LOCK_HOLDER = '__discovery__';

/** Timeout for discovery/preflight git (`ls-remote`, fetch/switch/reset). */
export const DISCOVERY_GIT_TIMEOUT_MS = 300_000;

/** Local reconcile interval for `lumpcode supervise`. */
export const SUPERVISE_LOCAL_PASS_INTERVAL_MS = 30_000;

/** How long graceful `stop --all` waits for lump daemons to drain. */
export const STOP_ALL_DRAIN_TIMEOUT_MS = 15 * 60 * 1000;

/** How long idle `stop` waits for SIGTERM to reap one daemon. */
export const DAEMON_IDLE_STOP_WAIT_MS = 5000;

/** How long `stop --force` waits after tree-kill for one daemon to exit. */
export const DAEMON_FORCE_STOP_WAIT_MS = 5000;
