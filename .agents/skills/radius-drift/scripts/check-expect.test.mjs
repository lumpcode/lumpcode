import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  compareExpect,
  isExpectPath,
  isNewFileExpect,
  normalizeNumstatPath,
  parseExpect,
  parseNumstat,
  scoreFile,
  scoreSymbol,
  splitKeyValue,
  symbolPresent,
} from "./check-expect.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const examplePath = join(here, "../../../examples/acquire-lock.expect.yml");

test("parses the canonical example", () => {
  const expectFile = parseExpect(readFileSync(examplePath, "utf8"));
  assert.equal(expectFile.legacy, false);
  assert.match(expectFile.desc ?? "", /acquireLock/);
  assert.equal(expectFile.files["src/lock.ts"].plus, 40);
  assert.equal(expectFile.files["src/lock.ts"].minus, 0);
  assert.equal(expectFile.files["src/lock.ts"].symbols.acquireLock, "create");
  assert.equal(expectFile.files["src/run.ts"].symbols.run, "update");
});

test("parses legacy root-path expects", () => {
  const expectFile = parseExpect(`
src/lock.ts:
  change: New helper.
  "-": 0
  "+": 40
src/run.ts:
  change: Call it.
  "-": 12
  "+": 8
`);
  assert.equal(expectFile.legacy, true);
  assert.equal(expectFile.files["src/lock.ts"].desc, "New helper.");
  assert.equal(expectFile.files["src/run.ts"].plus, 8);
});

test("parses folded desc", () => {
  const expectFile = parseExpect(`
desc: >-
  Extract acquireLock so setup
  and teardown share one callback.
files:
  src/lock.ts:
    desc: New helper.
    "-": 0
    "+": 40
`);
  assert.equal(
    expectFile.desc,
    "Extract acquireLock so setup and teardown share one callback.",
  );
});

test("splitKeyValue handles quoted +/- keys", () => {
  assert.deepEqual(splitKeyValue('"-": 12'), { key: "-", rest: "12" });
  assert.deepEqual(splitKeyValue('"+": 8'), { key: "+", rest: "8" });
});

test("parses CSS custom properties and class selectors as symbols", () => {
  const expectFile = parseExpect(`
desc: "Tweak manifesto tokens."
files:
  site/styles.css:
    desc: "Retint --bg and .hero."
    "-": 2
    "+": 4
    symbols:
      --bg: update
      .hero: update
      ".skip:focus": update
`);
  assert.equal(expectFile.files["site/styles.css"].symbols["--bg"], "update");
  assert.equal(expectFile.files["site/styles.css"].symbols[".hero"], "update");
  assert.equal(expectFile.files["site/styles.css"].symbols[".skip:focus"], "update");
});

test("splitKeyValue keeps colons inside unquoted CSS selectors", () => {
  assert.deepEqual(splitKeyValue(".skip:focus: update"), {
    key: ".skip:focus",
    rest: "update",
  });
});

test("symbolPresent finds CSS variables and classes", () => {
  const css = `:root { --bg: #fff; --ink: #111; }\n.hero { color: var(--ink); }\n.skip:focus { top: 0; }\n`;
  assert.equal(symbolPresent(css, "--bg"), true);
  assert.equal(symbolPresent(css, "--missing"), false);
  assert.equal(symbolPresent(css, ".hero"), true);
  assert.equal(symbolPresent(css, ".skip:focus"), true);
  assert.equal(symbolPresent(css, "hero"), true);
  assert.equal(symbolPresent("export function run() {}", "run"), true);
  assert.equal(symbolPresent("export function runner() {}", "run"), false);
});

test("scoreSymbol matches create / update / delete including CSS tokens", () => {
  assert.equal(
    scoreSymbol("create", "--dot-current", ":root { --bg: #fff; }\n", ":root { --bg: #fff; --dot-current: orange; }\n", "+  --dot-current: orange;"),
    true,
  );
  assert.equal(
    scoreSymbol("update", "--bg", ":root { --bg: #fff; }\n", ":root { --bg: #000; }\n", "-  --bg: #fff;\n+  --bg: #000;"),
    true,
  );
  assert.equal(
    scoreSymbol("update", "--bg", ":root { --bg: #fff; }\n", ":root { --bg: #fff; }\n", ""),
    false,
  );
  assert.equal(
    scoreSymbol("delete", ".hero", ".hero { color: red; }\n", "body { color: red; }\n", "-.hero { color: red; }"),
    true,
  );
});

test("compareExpect flags a missed CSS symbol as drifted", () => {
  const expectFile = parseExpect(`
desc: "Retint."
files:
  site/styles.css:
    desc: "Change --bg."
    "-": 1
    "+": 1
    symbols:
      --bg: update
`);
  const missed = compareExpect(
    expectFile,
    [{ path: "site/styles.css", plus: 1, minus: 1 }],
    new Map([
      [
        "site/styles.css",
        {
          base: ":root { --bg: #fff; }\n",
          head: ":root { --bg: #fff; --ink: #111; }\n",
          patch: "+  --ink: #111;",
        },
      ],
    ]),
  );
  assert.equal(missed.verdict, "drifted");
  assert.equal(missed.listed[0].symbols[0].matched, false);

  const hit = compareExpect(
    expectFile,
    [{ path: "site/styles.css", plus: 1, minus: 1 }],
    new Map([
      [
        "site/styles.css",
        {
          base: ":root { --bg: #fff; }\n",
          head: ":root { --bg: #000; }\n",
          patch: "-  --bg: #fff;\n+  --bg: #000;",
        },
      ],
    ]),
  );
  assert.equal(hit.verdict, "matches");
  assert.equal(hit.listed[0].symbols[0].matched, true);
});

test("isNewFileExpect is false when update or deletions are listed", () => {
  assert.equal(isNewFileExpect({ minus: 0, symbols: { acquireLock: "create" } }), true);
  assert.equal(isNewFileExpect({ minus: 0, symbols: { run: "update" } }), false);
  assert.equal(isNewFileExpect({ minus: 12, symbols: { run: "create" } }), false);
});

test("numstat rename uses the new path", () => {
  assert.equal(
    normalizeNumstatPath("src/{lock.ts => mutex.ts}"),
    "src/mutex.ts",
  );
  const rows = parseNumstat("40\t0\tsrc/lock.ts\n8\t12\tsrc/run.ts\n");
  assert.equal(rows[0].plus, 40);
  assert.equal(rows[1].minus, 12);
});

test("compareExpect scores match / missing / extra / over-under", () => {
  const expectFile = parseExpect(readFileSync(examplePath, "utf8"));
  const match = compareExpect(expectFile, [
    { path: "src/lock.ts", plus: 42, minus: 0 },
    { path: "src/run.ts", plus: 8, minus: 12 },
  ]);
  assert.equal(match.verdict, "matches");
  assert.equal(match.listed[0].status, "match");

  const missing = compareExpect(expectFile, [{ path: "src/lock.ts", plus: 40, minus: 0 }]);
  assert.equal(missing.verdict, "drifted");
  assert.equal(missing.listed.find((row) => row.path === "src/run.ts")?.status, "missing");

  const extra = compareExpect(expectFile, [
    { path: "src/lock.ts", plus: 40, minus: 0 },
    { path: "src/run.ts", plus: 8, minus: 12 },
    { path: "docs/note.md", plus: 4, minus: 0 },
    { path: "expect.yml", plus: 20, minus: 0 },
    { path: "blast.yml", plus: 20, minus: 0 },
  ]);
  assert.equal(extra.verdict, "close");
  assert.equal(extra.extra.length, 1);
  assert.equal(extra.extra[0].path, "docs/note.md");
  assert.equal(isExpectPath("expect.yml"), true);
  assert.equal(isExpectPath("blast.yml"), true);

  const blown = compareExpect(expectFile, [
    { path: "src/lock.ts", plus: 200, minus: 0 },
    { path: "src/run.ts", plus: 8, minus: 12 },
  ]);
  assert.equal(blown.verdict, "drifted");
  assert.equal(
    scoreFile(expectFile.files["src/lock.ts"], { path: "src/lock.ts", plus: 200, minus: 0 }),
    "over/under",
  );
});
