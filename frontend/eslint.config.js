import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // These rules are React Compiler diagnostics. The app does not enable the
      // compiler, and several established async/request patterns intentionally
      // use effects and refs without compiler transforms.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      // Co-located providers, hooks and constants are an intentional project
      // convention. This HMR-only rule does not identify runtime defects.
      'react-refresh/only-export-components': 'off',
    },
  },
])
