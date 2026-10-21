// Minimal Vitest setup — mostly pure-function/module tests in node. Component
// specs opt into a DOM per file (`// @vitest-environment jsdom`, rendered with
// @testing-library/react; react-test-renderer is deprecated in React 19 —
// upgrade 2026-10-21). Anything needing the Worker runtime is covered by
// scripts/smoke.sh instead.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  // lib/i18n.tsx and the component specs contain JSX — compile it with the
  // automatic runtime (what tsconfig's jsx:'react-jsx' means since Next 16).
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
  },
})
