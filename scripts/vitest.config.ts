import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsDir, "..");

export default defineConfig({
  root: repoRoot,
  test: {
    environment: "node",
    include: ["scripts/**/*.unit.test.mjs"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
