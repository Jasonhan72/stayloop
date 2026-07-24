// Minimal Vitest setup — pure-function/module tests only (no server, no DOM).
// The app targets Next 15 edge runtime; anything needing a browser/edge
// context is out of scope here and covered by scripts/smoke.sh instead.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  // lib/i18n.tsx contains JSX and the app tsconfig sets jsx:'preserve' (Next
  // handles it there) — tell the test transformer to compile it instead.
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
})
