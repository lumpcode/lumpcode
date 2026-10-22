#!/usr/bin/env node
/**
 * Check that an expect.yml is grounded in the current tree:
 * existing paths exist, and `update` symbols are already in those files.
 *
 * Usage:
 *   node validate-expect.mjs --expect path/to/expect.yml
 *   node validate-expect.mjs --expect path/to/expect.yml --json
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isNewFileExpect,
  parseArgs,
  parseExpect,
  symbolPresent,
} from "../../drift/scripts/check-expect.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {{ path: string, kind: "missing-file" | "missing-symbol", message: string }} ExpectIssue
 */

/**
 * @param {string} cwd
 * @param {string} relPath
 */
export function resolveListedPath(cwd, relPath) {
  return resolve(cwd, relPath);
}

/**
 * @param {{ expect: ReturnType<typeof parseExpect>, cwd?: string, readFile?: (path: string) => string, exists?: (path: string) => boolean }} options
 * @returns {{ ok: boolean, issues: ExpectIssue[] }}
 */
export function validateExpectDocument(options) {
  const cwd = options.cwd ?? process.cwd();
  const exists = options.exists ?? existsSync;
  const readFile = options.readFile ?? ((path) => readFileSync(path, "utf8"));
  /** @type {ExpectIssue[]} */
  const issues = [];

  for (const [relPath, entry] of Object.entries(options.expect.files)) {
    const absPath = resolveListedPath(cwd, relPath);
    const required = !isNewFileExpect(entry);
    const present = exists(absPath);

    if (!present) {
      if (required) {
        issues.push({
          path: relPath,
          kind: "missing-file",
          message: `Listed path does not exist: ${relPath}`,
        });
      }
      continue;
    }

    const updateSymbols = Object.entries(entry.symbols ?? {}).filter(
      ([, action]) => action === "update",
    );
    if (updateSymbols.length === 0) {
      continue;
    }
    const text = readFile(absPath);
    for (const [name] of updateSymbols) {
      if (!symbolPresent(text, name)) {
        issues.push({
          path: relPath,
          kind: "missing-symbol",
          message: `update symbol "${name}" is not in ${relPath}`,
        });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * @param {{ expect?: string, json?: boolean, parseOnly?: boolean, cwd?: string }} options
 */
export function validateExpect(options) {
  const cwd = options.cwd ?? process.cwd();
  if (!options.expect) {
    throw new Error("Pass --expect <path-to-expect.yml>");
  }
  const expectPath = resolve(cwd, options.expect);
  if (!existsSync(expectPath)) {
    throw new Error(`Expect not found: ${expectPath}`);
  }
  const expectFile = parseExpect(readFileSync(expectPath, "utf8"));
  const result = validateExpectDocument({ expect: expectFile, cwd });
  return { expectPath, ...result };
}

function printHelp() {
  console.log(`Check that an expect.yml lists real paths and update symbols.

Usage
  node ${SCRIPT_DIR}/validate-expect.mjs --expect <path>
  node ${SCRIPT_DIR}/validate-expect.mjs --expect <path> --json
`);
}

function formatReport(report) {
  if (report.ok) {
    return `Expect: ${report.expectPath}\nValid`;
  }
  const lines = [`Expect: ${report.expectPath}`, "Invalid", ""];
  for (const issue of report.issues) {
    lines.push(`- ${issue.message}`);
  }
  return lines.join("\n");
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
    const report = validateExpect(args);
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatReport(report));
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

if (isExecutedAsMain()) {
  main();
}
