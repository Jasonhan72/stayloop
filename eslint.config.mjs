// Flat config (Next 16 removed `next lint` and the .eslintrc preset; upgrade 2026-10-21).
// Same presets and rule overrides as the old .eslintrc.json. Lint does not gate the build.
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Same globs as the Next preset: the react-hooks plugin is only defined for these, so a .cjs
    // config file in the tree must not pick up the overrides (ESLint 9 refuses the whole run otherwise).
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    rules: {
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // React Compiler rules from eslint-plugin-react-hooks 7 (eslint-config-next 16). Cleaned up
      // 2026-10-23: refs written in a layout effect (lib/ui/useLatest), components hoisted to module
      // level, Date.now() out of render, derived state computed in render or adjusted with
      // lib/ui/useOnChange, stored preferences via useSyncExternalStore (lib/ui/useStoredChoice).
      // These four make the compiler skip a component, so they are errors (the screening module,
      // which is not edited without an explicit ask, keeps them as warnings below).
      'react-hooks/refs': 'error',
      'react-hooks/static-components': 'error',
      'react-hooks/purity': 'error',
      'react-hooks/immutability': 'error',
      'react-hooks/globals': 'error',
      // set-state-in-effect is advisory (not a compiler bail-out). What it still flags here is the
      // documented use of effects — syncing React state with an external system: resetting rows when
      // auth.user changes, `void load()` into Supabase, `setLoading(true)` before a fetch. Rewriting
      // ~100 of those into other structures would change behaviour for no compiler benefit, so the
      // rule is off; derived-state cases were fixed instead (useOnChange / useStoredChoice).
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    // Screening module (CLAUDE.md: not edited without an explicit ask) — the compiler rules stay visible as warnings.
    files: ['app/screening/**', 'app/api/screen-score/**', 'app/api/deep-check/**', 'lib/generateReport.ts', 'lib/forensics/**'],
    rules: {
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
