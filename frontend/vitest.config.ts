import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Unit tests only — Playwright e2e specs run via `npx playwright test`
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
