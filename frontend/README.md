# DocVault web client

React 19, TypeScript and Vite client for the AI Cloud Document Vault. The web
client is the primary interface; the Expo app is a capture-focused companion.

## Development

```powershell
cd C:\FYP\frontend
npm ci
npm run dev
```

The Vite development server runs at <http://localhost:3000> and proxies `/api`
to the FastAPI service at <http://localhost:8000>. Start the repository Docker
stack first when exercising real authentication or data.

## Quality gate

```powershell
npm run lint
npm test -- --run
npm run build
npx playwright test
```

The verified baseline is 25 Vitest tests and eight Playwright scenarios. Two
authenticated browser scenarios use an explicitly enabled seed account in CI
and skip in an ordinary local run without `E2E_EMAIL`/`E2E_PASSWORD`.

## Structure

- `src/pages/` — lazy-loaded application routes
- `src/components/` — shared product and UI components
- `src/lib/api.ts` — typed API client and token refresh
- `src/lib/auth.tsx` — authentication context
- `src/lib/queryClient.ts` — TanStack Query configuration
- `e2e/` — Playwright journeys against the real frontend/backend

Route-level server state uses TanStack Query where migrated. Some smaller flows
still use component state; conversion is incremental rather than a completion
requirement.

For the complete system, see the root [README](../README.md),
[as-built architecture](../specs/ARCHITECTURE.md), and
[testing guide](../TESTING.md).
