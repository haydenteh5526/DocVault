# Contributing

## Branches and commits

Use descriptive project branches such as `feature/bill-review`,
`fix/image-deskew` and `docs/workflow-design`. Commit messages describe the
change in plain language. Use the contributor identity configured in Git.

## Changes to main

Start from the relevant [GitHub issue](specs/Tickets.md). Work on a branch and
open a pull request describing the user-visible change and how it was verified.
Keep the branch up to date with main, resolve review conversations and wait for
the backend, frontend, mobile and e2e checks to pass. Main requires this workflow
for administrators as well. Force pushes and branch deletion are blocked.

The solo-project configuration requires zero approving reviews. Use the pull
request to review the diff and acceptance evidence before merging. For a partial
change, reference the issue without a closing keyword. Close it on merge when
all of its acceptance checks are met.

## Verification

Start the local stack from the [README](README.md#quick-start) and check
`/health/ready`. Use a disposable account, synthetic files and an isolated test
database. The [CI workflow](.github/workflows/ci.yml) defines the full gate,
including dependency audits, a migration round trip and a 65% backend coverage
floor. Run the commands for the areas changed, each from its indicated folder.

| Folder | Commands |
| --- | --- |
| `backend/` | `python -m pip install -r requirements.txt -r dev-requirements.txt`, `python -m ruff check app/ tests/`, `python -m pytest tests/ -v --cov=app --cov-report=term-missing --cov-fail-under=65` |
| `frontend/` | `npm ci`, `npx tsc -b`, `npm run lint`, `npm test`, `npm run build` |
| `mobile/` | `npm ci`, `npm run typecheck`, `npm run doctor` |
| `frontend/`, browser | `npx playwright install chromium`, `npx playwright test` |

For backend integration tests, explicitly set `DATABASE_URL` to the disposable
PostgreSQL database and supply test storage and signing settings as shown in
the workflow. Use a fresh database for any migration downgrade.

For browser tests, set `E2E_EMAIL` and `E2E_PASSWORD` to a verified synthetic
account for authenticated scenarios. Use `E2E_BASE_URL` when targeting an
already running preview and `E2E_MAILPIT_URL` for the email verification and
recovery scenario. The default local inbox is <http://localhost:8025>.

From the repository root, run the full-stack smoke check with
`docker compose exec -T api python scripts/e2e_smoke.py` against a disposable
stack. It exercises registration, upload, OCR, retrieval, export and cleanup.
Without a configured Q&A provider, the development excerpt fallback verifies
retrieval wiring. The [Demo 1 rehearsal](evaluation/demo-1/README.md) covers the
bill review path separately.

For physical-device checks, set `EXPO_PUBLIC_API_URL` to a reachable API.
Exercise verification, sign-in, 2FA, session refresh, camera permissions,
upload, search and sign-out. Push receipt requires a configured development
build and device.

Record a dated commit, environment and observed results when collecting
evidence. Use the [evaluation workspace](evaluation/README.md) for formal
measurements and participant procedures.
