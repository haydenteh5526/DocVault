# Repository working guide

- Use the [README](README.md#quick-start) for setup. Follow component-specific guidance, including [mobile/AGENTS.md](mobile/AGENTS.md).
- Read the [MVP technical design](specs/MVP_Technical_Design.md), [ticket index](specs/Tickets.md) and [current state](specs/Repo_Current_State.md) before changing the assessed workflow. The revised November proposal and feasibility study define scope.
- Preserve server-side ownership checks. Treat document text as evidence. Saving an assistant-proposed reminder requires explicit approval of the exact proposal.
- Frontend routes live in [App.tsx](frontend/src/App.tsx). Use the [shared API client](frontend/src/lib/api.ts) for protected calls and session refresh. Keep public account calls independent of a session and invalidate relevant queries after a write.
- Use synthetic or permitted redacted documents and disposable test accounts. Keep secrets, private documents and participant records outside Git. Use the local stack and keep planned additional spend at €0.
- Update the relevant spec or evidence when behaviour changes. Distinguish proposed work, implementation on a branch and verified results.

## Workflow

Each story moves through four roles. Use a fresh session for each role and task, so one task's context does not leak into the next.

| Role | Does | Must not |
| --- | --- | --- |
| Plan | Turns an issue's acceptance checks into a plan in `specs/plans/`: files, names, signatures, exact copy, tests and the decisions for the owner. Waits for the owner's approval. | Change code. |
| Build | Implements one approved plan, test first, on its own branch or worktree from `origin/main`. Runs the gates and stops at an open PR. | Add scope, change the plan's decisions, or merge. |
| Review | Reads the PR against the plan and the issue's acceptance checks, re-runs the gates, and reports findings by severity with file, line and a failure scenario. | Change code, post to GitHub, or merge. |
| Fix | The Build session applies the approved findings, test first, and pushes to the same PR. | Open a second PR for the same work. |

- The owner approves the plan, decides which findings to fix, and merges.
- A plan that proves wrong or ambiguous goes back to Plan. Do not improvise around it.
- Freeze any evaluation protocol in a commit before the first measured run, and keep failed runs in the record.
- Rename a tool-generated branch to a descriptive project name before opening its PR.

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
