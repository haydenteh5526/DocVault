# Repository working guide

- Use the [README](README.md#quick-start) for setup. Follow component-specific guidance, including [mobile/AGENTS.md](mobile/AGENTS.md).
- Read the [MVP technical design](specs/MVP_Technical_Design.md), [ticket index](specs/Tickets.md) and [current state](specs/Repo_Current_State.md) before changing the assessed workflow. The revised November proposal and feasibility study define scope.
- Preserve server-side ownership checks. Treat document text as evidence. Saving an assistant-proposed reminder requires explicit approval of the exact proposal.
- Frontend routes live in [App.tsx](frontend/src/App.tsx). Use the [shared API client](frontend/src/lib/api.ts) for protected calls and session refresh. Keep public account calls independent of a session and invalidate relevant queries after a write.
- Use synthetic or permitted redacted documents and disposable test accounts. Keep secrets, private documents and participant records outside Git. Use the local stack and keep planned additional spend at €0.
- Update the relevant spec or evidence when behaviour changes. Distinguish proposed work, implementation on a branch and verified results.

## Workflow

| Role | Where | Does | Must not |
| --- | --- | --- | --- |
| Architect | Root checkout. Ephemeral session (Opus, medium effort; high only for complex architecture), archived once you approve the plan. | Turns an issue's acceptance checks into one plan in `specs/plans/`: files, names, signatures, exact copy, tests, owner decisions. Keeps each plan to one PR (about 250 lines max) and splits large redesigns into sequenced plans. Commits the plan on the feature branch and waits for approval. | Change application code, commit to `main`, or start Build sessions. |
| Build / Issue / Redesign | Its own top-level worktree, cut from the branch holding the approved plan (Sonnet, medium effort). | Builds test first and runs the local gates. For a UI change, captures and shows the [visual proof](#uiux-visual-proof). Calls `reviewer`, or `reviewer-deep` for auth or ownership, reminder-approval safety and DB migrations. Shows the owner the full report, applies only approved fixes, opens the PR. After the owner approves, merges only under the merge rule below, then archives the worktree. | Add scope, change the plan's decisions, filter the report, or merge unapproved. |
| Reviewer | Read-only subagent (`reviewer` or `reviewer-deep`) with fresh context. | Checks the diff against the plan, the issue's acceptance checks, `gh pr checks` and, for a UI change, the visual proof. Reports findings by severity with file, line and failure scenario, then `APPROVE` or `CHANGES_REQUESTED`. | Edit code, push, comment, merge, or re-run full local suites. |

- The owner approves the plan, decides which findings to fix and approves the merge.
- Merge rule: merge with a merge commit pinned to the reviewed head SHA (`gh pr merge <n> --merge --match-head-commit <sha>`) only when all hold:
  - The Reviewer's verdict on that exact head commit is `APPROVE`, nothing suspected is unresolved, and every earlier finding is recorded in the description as fixed or left by the owner's decision.
  - `backend`, `frontend`, `mobile` and `e2e` are green on that commit, and the PR is open, mergeable and current with `main`.
  - The description, commits and branch name carry no tool or AI attribution.
  - Nothing else changes: no force-push, no issue closing, no branch deletion.
- Record the Reviewer's full report in the PR description, with what was fixed and what was left.
- A plan that proves wrong or ambiguous goes back to the Architect. Do not improvise around it.
- Freeze any evaluation protocol in a commit before the first measured run, and keep failed runs in the record.
- Rename a tool-generated branch to a descriptive project name before opening its PR.

## Pull requests

- Use a descriptive project branch and the configured Git identity. Submit a pull request to protected `main`, reference the relevant issue and record verification. GitHub Issues holds progress and acceptance criteria. Use a closing keyword only when the PR meets all acceptance checks.
- Keep the branch current with `main`, resolve review conversations and wait for the four checks before merging.
- Maintain dependencies manually through tested PRs. Keep scheduled dependency updates disabled and retain the CI audits.

## Verification

The [CI workflow](.github/workflows/ci.yml) is the full gate (audits, migration round trip, 65% backend coverage floor). A Stop hook (`.claude/hooks/fast-verify.mjs`) runs the fast static checks for touched areas. Run the rest from each directory:

| Directory | Checks |
| --- | --- |
| `backend/` | `requirements.txt` and `dev-requirements.txt`, then `python -m ruff check app/ tests/` and `python -m pytest tests/ --cov=app --cov-fail-under=65` |
| `frontend/` | `npm ci`, `npx tsc -b`, `npm run lint`, `npm test`, `npm run build` |
| `frontend/` (browser) | `npx playwright install chromium`, `npx playwright test` |
| `mobile/` | `npm ci`, `npm run typecheck`, `npm run doctor` |

Check `/health/ready` first, and use disposable `DATABASE_URL` and storage settings. Browser checks use `E2E_BASE_URL`, `E2E_EMAIL`, `E2E_PASSWORD` (plus `E2E_EMAIL_2`, `E2E_PASSWORD_2`) and `E2E_MAILPIT_URL` (default <http://localhost:8025>). Smoke test: `docker compose exec -T api python scripts/e2e_smoke.py`. For devices set `EXPO_PUBLIC_API_URL`. Record commit, environment and results. See [evaluation/README.md](evaluation/README.md) and the [Demo 1 walkthrough](evaluation/demo-1/README.md).

## UI/UX visual proof

- **When:** any change to visible frontend UI, layout, copy, navigation, interactive flows or visual states.
- **Capture before asking to push or open a PR:**
  - Use a headless Playwright script against a disposable local stack: `chromium.launch({ headless: true })` from `@playwright/test`. Never `channel: 'chrome'`, never `headless: false`, never the Playwright MCP plugin, never the owner's Chrome.
  - Cover every modified screen, flow and key state (for example default, active, toast, error, empty and populated) at desktop `1366×768` and mobile `390×844`.
- **Inspect, then show:** view every image first and fix any layout, overflow or contrast defect. Then show the screenshots in the chat with a short table of what each one proves.
- **Repo hygiene:**
  - Save verification screenshots under `evaluation/visual-proof/<branch>/`, which is ignored by Git, or in another untracked folder the plan names.
  - Commit screenshots only when the plan explicitly lists them as tracked evaluation assets.
- **Review gate:** for a UI change, the Reviewer reports missing or unshown visual proof as a finding.
