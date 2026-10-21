// Flat config (Next 16 removed `next lint` and the .eslintrc preset; upgrade 2026-10-21).
// Same presets and rule overrides as the old .eslintrc.json. Lint does not gate the build.
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // React Compiler rules that eslint-plugin-react-hooks 7 (eslint-config-next 16) turned on as
      // errors. They flag ~200 existing patterns (mostly setState in effects); kept visible as warnings
      // so the upgrade does not change what lint fails on. Fix before enabling the React Compiler.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/globals': 'warn',
    },
  },
  // ESLint 8 skipped dot-directories by default; flat config does not (.claude/ holds whole worktrees).
  globalIgnores(['.next/**', '.open-next/**', '.wrangler/**', 'out/**', 'build/**', 'next-env.d.ts', '.claude/**', '.deploy-staging/**', '.forensics-tmp/**', '.screen-patches/**']),
])
