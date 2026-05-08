// vitest config — minimal, only runs ts files under lib/__tests__/ and
// lib/**/__tests__/. Does not load the Next.js app — these are pure
// TypeScript unit tests for forensics + agent + utility modules.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    include: ['lib/**/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
