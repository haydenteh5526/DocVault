# DocVault web client

Use the [root quick start](../README.md#quick-start) to run the full app and the
[verification guide](../AGENTS.md#verification) for test commands.

## Run Vite on the host

Prepare `.env` as described in the quick start. From the repository root, start
the backend with `docker compose up -d --build api worker`, then run the
migration and model setup commands from the quick start.
If the Compose web service is running, stop it with `docker compose stop web`
to free port 3000. Then run:

```powershell
cd frontend
npm ci
npm run dev
```

Open <http://localhost:3000>. Vite sends `/api` requests to the API on port 8000.

## Code map

| Area | Entry point |
| --- | --- |
| Routes and protected views | [`src/App.tsx`](src/App.tsx) and [`src/pages/`](src/pages/) |
| Reusable UI | [`src/components/`](src/components/) |
| API and authentication | [`src/lib/api.ts`](src/lib/api.ts), [`src/lib/auth.tsx`](src/lib/auth.tsx) |
| Server state | [`src/lib/queryClient.ts`](src/lib/queryClient.ts) |
| Browser scenarios | [`e2e/`](e2e/) |

Public account requests work without a bearer token. Protected requests use the
shared API client for token refresh and retry. The browser currently stores
tokens in local storage, and the [OAuth callback](src/pages/OAuthCallback.tsx)
clears the URL fragment after reading it. Handle API errors in the shared
client and invalidate the relevant queries after a write.
