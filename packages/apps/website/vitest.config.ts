import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const websiteRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(websiteRoot, '../../..')

export default defineConfig({
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
  test: {
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
