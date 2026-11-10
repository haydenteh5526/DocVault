# Repository working guide

- Use the [README](README.md#quick-start) for setup. Follow component-specific guidance, including [mobile/AGENTS.md](mobile/AGENTS.md).
- Read the [MVP technical design](specs/MVP_Technical_Design.md), [ticket index](specs/Tickets.md) and [current state](specs/Repo_Current_State.md) before changing the assessed workflow. The revised November proposal and feasibility study define scope.
- Preserve server-side ownership checks. Treat document text as evidence. Saving an assistant-proposed reminder requires explicit approval of the exact proposal.
- Use synthetic or permitted redacted documents and disposable test accounts. Keep secrets, private documents and participant records outside Git. Use the local stack and keep planned additional spend at €0.
- Update the relevant spec or evidence when behaviour changes. Distinguish proposed work, implementation on a branch and verified results.

## Pull requests

- Use a descriptive project branch and the configured Git identity. Submit a pull request to protected `main`, reference the relevant issue and record verification. GitHub Issues holds progress and acceptance criteria. Use a closing keyword only when the PR meets all acceptance checks.
- Keep the branch current with `main`, resolve review conversations and wait for the backend, frontend, mobile and e2e checks before merging.
- Maintain dependencies manually through tested PRs. Keep scheduled dependency updates disabled and retain the CI audits.

## Verification

Use the [CI workflow](.github/workflows/ci.yml) for the full gate, including audits, the migration round trip and the 65% backend coverage floor. Run the relevant checks from their component directories.

| Directory | Checks |
| --- | --- |
| `backend/` | Install `requirements.txt` and `dev-requirements.txt`. Run `python -m ruff check app/ tests/` and `python -m pytest tests/ --cov=app --cov-fail-under=65`. |
| `frontend/` | Run `npm ci`, `npx tsc -b`, `npm run lint`, `npm test` and `npm run build`. |
| `frontend/` (browser) | Run `npx playwright install chromium` and `npx playwright test`. |
| `mobile/` | Run `npm ci`, `npm run typecheck` and `npm run doctor`. |

Check `/health/ready` before testing. Set `DATABASE_URL` and storage settings to disposable test services. Use a fresh database for migration downgrades.

For browser checks, set `E2E_BASE_URL` for a running preview, `E2E_EMAIL` and `E2E_PASSWORD` for a verified synthetic account, and `E2E_MAILPIT_URL` for the email scenarios. The default inbox is <http://localhost:8025>.

For the full-stack smoke test, run `docker compose exec -T api python scripts/e2e_smoke.py` from the repository root against a disposable stack. The development excerpt fallback verifies retrieval wiring. For device checks, set `EXPO_PUBLIC_API_URL` to a reachable API and use a configured development build for push receipt.

Record the commit, environment and observed results. See the [evaluation workspace](evaluation/README.md) for formal measurements and the [Demo 1 walkthrough](evaluation/demo-1/README.md) for the bill review.
