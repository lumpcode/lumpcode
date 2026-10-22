import assert from "node:assert/strict";
import { test } from "node:test";

import { parseExpect } from "../../drift/scripts/check-expect.mjs";
import { validateExpectDocument } from "./validate-expect.mjs";

const css = `:root { --bg: #ffffff; --ink: #0b0d10; }

.hero {
  padding: 4.5rem 0 3.25rem;
}
`;

function files(map) {
  return {
    exists: (path) => path in map,
    readFile: (path) => map[path],
  };
}

test("existing files with update symbols must be present in the tree", () => {
  const expectFile = parseExpect(`
desc: "Retint the hero."
files:
  site/styles.css:
    desc: "Change --bg."
    "-": 1
    "+": 1
    symbols:
      --bg: update
      .hero: update
`);
  const ok = validateExpectDocument({
    expect: expectFile,
    cwd: "/",
    ...files({ "/site/styles.css": css }),
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.issues.length, 0);
});

test("flags a missing existing path and a missing update symbol", () => {
  const expectFile = parseExpect(`
desc: "Retint the hero."
files:
  site/styles.css:
    desc: "Change --bg and a missing class."
    "-": 1
    "+": 1
    symbols:
      --bg: update
      .missing: update
  src/lock.ts:
    desc: "Touch run."
    "-": 2
    "+": 2
    symbols:
      run: update
`);
  const result = validateExpectDocument({
    expect: expectFile,
    cwd: "/",
    ...files({ "/site/styles.css": css }),
  });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.issues.map((issue) => issue.kind).sort(),
    ["missing-file", "missing-symbol"],
  );
  assert.match(result.issues.find((issue) => issue.kind === "missing-symbol")?.message ?? "", /\.missing/);
  assert.match(result.issues.find((issue) => issue.kind === "missing-file")?.message ?? "", /src\/lock\.ts/);
});

test("new files do not need to exist yet", () => {
  const expectFile = parseExpect(`
desc: "Add a lock helper."
files:
  src/lock.ts:
    desc: "New helper."
    "-": 0
    "+": 40
    symbols:
      acquireLock: create
`);
  const result = validateExpectDocument({
    expect: expectFile,
    cwd: "/",
    ...files({}),
  });
  assert.equal(result.ok, true);
});
