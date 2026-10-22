#!/usr/bin/env node
/**
 * Compare an expect.yml to `git diff --numstat` against a base ref.
 *
 * Usage:
 *   node check-expect.mjs --expect path/to/expect.yml
 *   node check-expect.mjs --expect path/to/expect.yml --base origin/main
 *   node check-expect.mjs --expect path/to/expect.yml --json
 *   node check-expect.mjs --expect path/to/expect.yml --parse-only
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {{ desc?: string, minus?: number, plus?: number, symbols?: Record<string, string> }} ExpectFile
 * @typedef {{ desc?: string, files: Record<string, ExpectFile>, legacy: boolean }} Expect
 * @typedef {{ path: string, plus: number, minus: number }} NumstatRow
 */

/**
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  /** @type {{ expect?: string, base?: string, json: boolean, parseOnly: boolean, help: boolean }} */
  const out = { json: false, parseOnly: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--json") {
      out.json = true;
      continue;
    }
    if (arg === "--parse-only") {
      out.parseOnly = true;
      continue;
    }
    if (arg === "--expect" || arg === "--blast") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`Missing value for ${arg}`);
      }
      out.expect = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("--expect=")) {
      out.expect = arg.slice("--expect=".length);
      continue;
    }
    if (arg.startsWith("--blast=")) {
      out.expect = arg.slice("--blast=".length);
      continue;
    }
    if (arg === "--base") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("Missing value for --base");
      }
      out.base = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("--base=")) {
      out.base = arg.slice("--base=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\nRun with --help for usage.`);
  }
  return out;
}

/**
 * Constrained YAML map parser for expect.yml (canonical + legacy).
 * @param {string} text
 * @returns {Expect}
 */
export function parseExpect(text) {
  const lines = tokenizeYaml(text);
  const root = parseMap(lines, 0, 0).value;
  return normalizeExpect(root);
}

/**
 * @param {string} text
 * @returns {{ indent: number, raw: string }[]}
 */
export function tokenizeYaml(text) {
  const lines = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmedRight = rawLine.replace(/\s+$/, "");
    if (!trimmedRight.trim()) {
      continue;
    }
    const indent = trimmedRight.match(/^ */)[0].length;
    const raw = trimmedRight.slice(indent);
    if (raw.startsWith("#")) {
      continue;
    }
    lines.push({ indent, raw });
  }
  return lines;
}

/**
 * @param {{ indent: number, raw: string }[]} lines
 * @param {number} index
 * @param {number} indent
 * @returns {{ value: Record<string, unknown>, next: number }}
 */
function parseMap(lines, index, indent) {
  /** @type {Record<string, unknown>} */
  const value = {};
  let i = index;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) {
      break;
    }
    if (line.indent > indent) {
      throw new Error(`Unexpected indent at: ${line.raw}`);
    }
    const parsed = splitKeyValue(line.raw);
    if (!parsed) {
      throw new Error(`Expected key: value at: ${line.raw}`);
    }
    const { key, rest } = parsed;
    i += 1;
    if (rest === null) {
      const next = lines[i];
      if (!next || next.indent <= indent) {
        value[key] = {};
        continue;
      }
      const nested = parseMap(lines, i, next.indent);
      value[key] = nested.value;
      i = nested.next;
      continue;
    }
    if (rest === ">" || rest === ">|" || rest === ">-" || rest === "|" || rest === "|-") {
      const folded = readFolded(lines, i, indent);
      value[key] = folded.value;
      i = folded.next;
      continue;
    }
    value[key] = parseScalar(rest);
  }
  return { value, next: i };
}

/**
 * @param {{ indent: number, raw: string }[]} lines
 * @param {number} index
 * @param {number} parentIndent
 */
function readFolded(lines, index, parentIndent) {
  const chunks = [];
  let i = index;
  while (i < lines.length && lines[i].indent > parentIndent) {
    chunks.push(lines[i].raw);
    i += 1;
  }
  return { value: chunks.join(" ").trim(), next: i };
}

const SYMBOL_ACTIONS = new Set(["create", "update", "delete"]);

/**
 * @param {string} raw
 * @returns {{ key: string, rest: string | null } | null}
 */
export function splitKeyValue(raw) {
  const quoted = raw.match(/^["'](.+)["']\s*:(?:\s*(.*))?$/);
  if (quoted) {
    const rest = quoted[2] === undefined || quoted[2] === "" ? null : quoted[2];
    return { key: quoted[1], rest };
  }
  const idx = raw.indexOf(":");
  if (idx <= 0) {
    return null;
  }
  const key = raw.slice(0, idx).trim();
  const after = raw.slice(idx + 1);
  if (!key) {
    return null;
  }
  const rest = after.trim() === "" ? null : after.trim();
  if (rest && !SYMBOL_ACTIONS.has(rest) && rest.includes(":")) {
    const actionSplit = raw.match(/^(.*?):\s*(create|update|delete)\s*$/);
    if (actionSplit) {
      return { key: actionSplit[1].trim(), rest: actionSplit[2] };
    }
  }
  return { key, rest };
}

/**
 * @param {string} raw
 * @returns {string | number | boolean}
 */
export function parseScalar(raw) {
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  if (/^-?\d+$/.test(raw)) {
    return Number(raw);
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return raw;
}

/**
 * @param {Record<string, unknown>} root
 * @returns {Expect}
 */
export function normalizeExpect(root) {
  if (root.files && typeof root.files === "object") {
    /** @type {Record<string, ExpectFile>} */
    const files = {};
    for (const [path, value] of Object.entries(root.files)) {
      files[path] = normalizeFile(value);
    }
    return {
      desc: typeof root.desc === "string" ? root.desc : undefined,
      files,
      legacy: false,
    };
  }

  /** @type {Record<string, ExpectFile>} */
  const files = {};
  for (const [key, value] of Object.entries(root)) {
    if (key === "desc") {
      continue;
    }
    if (value && typeof value === "object") {
      files[key] = normalizeFile(value);
    }
  }
  return {
    desc: typeof root.desc === "string" ? root.desc : undefined,
    files,
    legacy: true,
  };
}

/**
 * @param {unknown} value
 * @returns {ExpectFile}
 */
function normalizeFile(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  const entry = /** @type {Record<string, unknown>} */ (value);
  const desc =
    typeof entry.desc === "string"
      ? entry.desc
      : typeof entry.change === "string"
        ? entry.change
        : undefined;
  /** @type {Record<string, string> | undefined} */
  let symbols;
  if (entry.symbols && typeof entry.symbols === "object") {
    symbols = {};
    for (const [name, action] of Object.entries(entry.symbols)) {
      if (typeof action === "string") {
        symbols[name] = action;
      }
    }
  }
  return {
    desc,
    minus: asNumber(entry["-"]),
    plus: asNumber(entry["+"]),
    symbols,
  };
}

/**
 * @param {unknown} value
 * @returns {number | undefined}
 */
function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return Number(value);
  }
  return undefined;
}

/**
 * @param {string} text
 * @returns {NumstatRow[]}
 */
export function parseNumstat(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const match = line.match(/^(\S+)\t(\S+)\t(.+)$/);
    if (!match) {
      continue;
    }
    const plus = match[1] === "-" ? 0 : Number(match[1]);
    const minus = match[2] === "-" ? 0 : Number(match[2]);
    const path = normalizeNumstatPath(match[3]);
    rows.push({ path, plus, minus });
  }
  return rows;
}

/**
 * @param {string} path
 */
export function normalizeNumstatPath(path) {
  const rename = path.match(/\{(.+) => (.+)\}/);
  if (rename) {
    return path.replace(/\{.+ => .+\}/, rename[2]);
  }
  const arrow = path.match(/^(.*) => (.*)$/);
  if (arrow) {
    return arrow[2];
  }
  return path;
}

export function isExpectPath(path) {
  return /(^|\/)(expect|blast)\.yml$/.test(path);
}

/**
 * @param {string} value
 */
export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `name` appears as a token in `text`.
 * CSS custom properties (`--bg`) and selectors (`.hero`, `:root`) do not
 * sit on `\b` word boundaries, so those use a looser token edge.
 * @param {string} text
 * @param {string} name
 */
export function symbolPresent(text, name) {
  if (!text || !name) {
    return false;
  }
  const escaped = escapeRegExp(name);
  if (/^[-.:#@]/.test(name) || name.includes(":")) {
    return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`).test(text);
  }
  return new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`).test(text);
}

/**
 * @param {string} action
 * @param {string} name
 * @param {string} baseText
 * @param {string} headText
 * @param {string} patch
 */
export function scoreSymbol(action, name, baseText, headText, patch) {
  const inBase = symbolPresent(baseText, name);
  const inHead = symbolPresent(headText, name);
  if (action === "create") {
    return inHead && !inBase;
  }
  if (action === "delete") {
    return inBase && !inHead;
  }
  return inHead && symbolPresent(patch, name);
}

/**
 * A listed path is a new file when nothing in the expect requires it to
 * already exist: no update/delete symbols, and no expected deletions.
 * @param {ExpectFile} entry
 */
export function isNewFileExpect(entry) {
  const actions = Object.values(entry.symbols ?? {});
  if (actions.some((action) => action === "update" || action === "delete")) {
    return false;
  }
  if (entry.minus !== undefined && entry.minus > 0) {
    return false;
  }
  return true;
}

/**
 * @param {number | undefined} expected
 * @param {number} actual
 */
function sizeDelta(expected, actual) {
  if (expected === undefined) {
    return { status: "unscored", delta: 0 };
  }
  const delta = Math.abs(actual - expected);
  if (delta <= 10) {
    return { status: "match", delta };
  }
  const ratio = expected === 0 ? (actual === 0 ? 1 : Infinity) : actual / expected;
  const far = (ratio >= 2 || ratio <= 0.5) && delta >= 20;
  return { status: far ? "over/under" : "close", delta };
}

/**
 * @param {ExpectFile} expected
 * @param {NumstatRow | undefined} actual
 */
export function scoreFile(expected, actual) {
  if (!actual) {
    return "missing";
  }
  const plus = sizeDelta(expected.plus, actual.plus);
  const minus = sizeDelta(expected.minus, actual.minus);
  if (plus.status === "over/under" || minus.status === "over/under") {
    return "over/under";
  }
  if (plus.status === "close" || minus.status === "close") {
    return "close";
  }
  return "match";
}

/**
 * @param {ExpectFile} expected
 * @param {{ base: string, head: string, patch: string } | undefined} body
 */
export function scoreExpectedSymbols(expected, body) {
  if (!expected.symbols) {
    return [];
  }
  return Object.entries(expected.symbols).map(([name, action]) => ({
    name,
    action,
    matched: body ? scoreSymbol(action, name, body.base, body.head, body.patch) : false,
  }));
}

/**
 * @param {Expect} expectFile
 * @param {NumstatRow[]} actual
 * @param {Map<string, { base: string, head: string, patch: string }>} [symbolTexts]
 */
export function compareExpect(expectFile, actual, symbolTexts) {
  const actualByPath = new Map(actual.map((row) => [row.path, row]));
  const listed = Object.entries(expectFile.files).map(([path, expected]) => {
    const row = actualByPath.get(path);
    const symbols =
      expectFile.legacy || !expected.symbols || !symbolTexts
        ? undefined
        : scoreExpectedSymbols(expected, symbolTexts.get(path));
    return {
      path,
      expected,
      actual: row ? { plus: row.plus, minus: row.minus } : null,
      status: scoreFile(expected, row),
      symbols,
    };
  });

  const extra = actual
    .filter((row) => !expectFile.files[row.path] && !isExpectPath(row.path))
    .map((row) => ({
      path: row.path,
      expected: null,
      actual: { plus: row.plus, minus: row.minus },
      status: "extra",
    }));

  const statuses = [...listed.map((row) => row.status), ...extra.map((row) => row.status)];
  const symbolMiss = listed.some((row) => row.symbols?.some((symbol) => !symbol.matched));
  let verdict = "matches";
  if (
    statuses.includes("missing") ||
    statuses.includes("over/under") ||
    symbolMiss ||
    extra.some((row) => (row.actual?.plus ?? 0) + (row.actual?.minus ?? 0) >= 20)
  ) {
    verdict = "drifted";
  } else if (statuses.includes("close") || extra.length > 0) {
    verdict = "close";
  }

  return { listed, extra, verdict };
}

/**
 * @param {string} cwd
 * @param {string | undefined} requested
 */
export function resolveBase(cwd, requested) {
  if (requested) {
    return requested;
  }
  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const ref of candidates) {
    const result = git(["rev-parse", "--verify", ref], { cwd, capture: true, allowFail: true });
    if (result.status === 0) {
      return ref;
    }
  }
  throw new Error("Could not resolve a base ref. Pass --base <ref>.");
}

/**
 * @param {{ listed: ReturnType<typeof compareExpect>["listed"], extra: ReturnType<typeof compareExpect>["extra"], verdict: string, expectPath: string, desc?: string, base: string, legacy: boolean }} report
 */
export function formatReport(report) {
  const lines = [
    `Expect: ${report.expectPath}`,
    `Base: ${report.base}`,
    `Desc: ${report.desc ?? "(none)"}`,
    report.legacy ? "Shape: legacy (root paths + change)" : "Shape: canonical (files + symbols)",
    "",
    "File                          Expect −/+   Actual −/+    Status",
  ];
  for (const row of [...report.listed, ...report.extra]) {
    const expectSize = row.expected
      ? `${row.expected.minus ?? "-"}/${row.expected.plus ?? "-"}`
      : "-";
    const actualSize = row.actual ? `${row.actual.minus}/${row.actual.plus}` : "-";
    lines.push(
      `${pad(row.path, 29)} ${pad(expectSize, 12)} ${pad(actualSize, 13)} ${row.status}`,
    );
  }
  const symbolRows = report.listed.flatMap((row) =>
    (row.symbols ?? []).map(
      (symbol) =>
        `  ${row.path}  ${symbol.name} ${symbol.action} · ${symbol.matched ? "match" : "miss"}`,
    ),
  );
  if (symbolRows.length > 0) {
    lines.push("", "Symbols", ...symbolRows);
  }
  lines.push("", `Verdict: ${report.verdict}`);
  return lines.join("\n");
}

/**
 * @param {string} value
 * @param {number} width
 */
function pad(value, width) {
  if (value.length >= width) {
    return value;
  }
  return value + " ".repeat(width - value.length);
}

/**
 * @param {string[]} args
 * @param {{ cwd: string, capture?: boolean, allowFail?: boolean }} options
 */
function git(args, options) {
  const result = spawnSync("git", args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (!options.allowFail && result.status !== 0) {
    const detail = [result.stderr, result.stdout].join("\n").trim();
    throw new Error(`git ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result;
}

function printHelp() {
  console.log(`Compare an expect.yml to git diff --numstat.

Usage
  node ${SCRIPT_DIR}/check-expect.mjs --expect <path>
  node ${SCRIPT_DIR}/check-expect.mjs --expect <path> --base origin/main
  node ${SCRIPT_DIR}/check-expect.mjs --expect <path> --json
  node ${SCRIPT_DIR}/check-expect.mjs --expect <path> --parse-only
`);
}

/**
 * @param {{ expect?: string, base?: string, json?: boolean, parseOnly?: boolean, cwd?: string }} options
 */
export function checkExpect(options) {
  const cwd = options.cwd ?? process.cwd();
  if (!options.expect) {
    throw new Error("Pass --expect <path-to-expect.yml>");
  }
  const expectPath = resolve(cwd, options.expect);
  if (!existsSync(expectPath)) {
    throw new Error(`Expect not found: ${expectPath}`);
  }
  const expectFile = parseExpect(readFileSync(expectPath, "utf8"));
  if (options.parseOnly) {
    return { expectPath, expect: expectFile };
  }
  const base = resolveBase(cwd, options.base);
  const numstat = git(["diff", "--numstat", `${base}...HEAD`], {
    cwd,
    capture: true,
  }).stdout;
  const symbolTexts = expectFile.legacy
    ? undefined
    : loadSymbolTexts(cwd, base, Object.keys(expectFile.files).filter((path) => expectFile.files[path].symbols));
  const comparison = compareExpect(expectFile, parseNumstat(numstat), symbolTexts);
  return {
    expectPath,
    desc: expectFile.desc,
    legacy: expectFile.legacy,
    base,
    ...comparison,
  };
}

/**
 * @param {string} cwd
 * @param {string} base
 * @param {string[]} paths
 */
function loadSymbolTexts(cwd, base, paths) {
  /** @type {Map<string, { base: string, head: string, patch: string }>} */
  const texts = new Map();
  for (const path of paths) {
    const baseShow = git(["show", `${base}:${path}`], { cwd, capture: true, allowFail: true });
    const headShow = git(["show", `HEAD:${path}`], { cwd, capture: true, allowFail: true });
    const patch = git(["diff", `${base}...HEAD`, "--", path], {
      cwd,
      capture: true,
      allowFail: true,
    });
    texts.set(path, {
      base: baseShow.status === 0 ? baseShow.stdout : "",
      head: headShow.status === 0 ? headShow.stdout : "",
      patch: patch.status === 0 ? patch.stdout : "",
    });
  }
  return texts;
}

function isExecutedAsMain() {
  const invoked = process.argv[1];
  if (!invoked) {
    return false;
  }
  return resolve(invoked) === fileURLToPath(import.meta.url);
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      process.exit(0);
    }
    const report = checkExpect(args);
    if (args.json || args.parseOnly) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatReport(/** @type {any} */ (report)));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

if (isExecutedAsMain()) {
  main();
}
