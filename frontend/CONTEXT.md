# Frontend Context

> Current implementation notes for contributors. For setup commands, see
> [`README.md`](README.md). Project-wide status and architecture live in
> [`../specs/IMPLEMENTATION_STATUS.md`](../specs/IMPLEMENTATION_STATUS.md) and
> [`../specs/ARCHITECTURE.md`](../specs/ARCHITECTURE.md).

## Stack

- React 19 and TypeScript
- Vite 8
- React Router 7
- TanStack Query
- Tailwind CSS 4 and Radix UI primitives
- Vitest for unit tests and Playwright for end-to-end tests

## Application routes

Public routes:

- `/` — landing page (authenticated users are redirected to `/app`)
- `/login` and `/register` — password authentication
- `/verify` — email verification
- `/auth/callback` — Google OAuth callback
- `/forgot-password` and `/reset-password` — password recovery

Protected routes under `/app`:

- `/app` and `/app/ask` — Ask AI
- `/app/ask/:conversationId` — saved conversation
- `/app/documents` — document library
- `/app/documents/:id` — document detail and editing
- `/app/upload` — document upload
- `/app/search` — hybrid search
- `/app/warranties` — warranty tracking
- `/app/chats` — conversation search
- `/app/profile` and `/app/settings` — account settings

`App.tsx` is the authoritative route definition.

## Authentication behaviour

- Registration returns a verification message; it does not log the user in.
- Login can return tokens immediately or request a TOTP code.
- Access and refresh tokens are stored in browser `localStorage`.
- `authorizedFetch` retries one request after rotating the refresh token.
- A failed refresh clears the session and redirects to `/login`.
- OAuth tokens are read from the URL fragment rather than query parameters.

The browser storage choice is an accepted MVP trade-off. A production security
review should consider an HttpOnly-cookie session design and a CSP before public
deployment.

## API and server state

The client uses `/api/v1` by default, with Vite proxying local requests to the
backend. Set `VITE_API_URL` when the API is hosted elsewhere. Keep endpoint
descriptions in the generated FastAPI Swagger document (`/docs`) instead of
duplicating a list here.

TanStack Query owns server state and caching. Mutations should invalidate the
smallest relevant query set. API functions should throw the backend response's
`detail` message when available so pages do not report failed actions as
successful.

## Verification

Before opening a pull request:

```bash
npm run lint
npm test -- --run
npm run build
npx playwright test
```

The protected Playwright journey requires the CI stack and seeded CI-only test
account. See [`../TESTING.md`](../TESTING.md) for the exact workflow.
