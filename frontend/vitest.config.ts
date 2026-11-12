import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // Match the '@' alias in vite.config.ts so component tests resolve shared UI imports.
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Unit tests only — Playwright e2e specs run via `npx playwright test`
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
