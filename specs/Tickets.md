# Tickets

GitHub Issues holds the live backlog, acceptance criteria, task checklists and discussion. This index maps the assessed design to those issues. [Open the GitHub backlog](https://github.com/haydenteh5526/DocVault/issues)

## Household electricity bill workflow

[Epic #4](https://github.com/haydenteh5526/DocVault/issues/4) tracks the path from uploading a bill to approving a single internal reminder. The [MVP technical design](MVP_Technical_Design.md) defines each step.

| Issue | Type | Delivery and acceptance summary |
| --- | --- | --- |
| [#4 · Turn a household electricity bill into an approved reminder](https://github.com/haydenteh5526/DocVault/issues/4) | Epic | Complete and verify the four stories as one workflow by the 18 December 2026 proof of concept. |
| [#1 · Review and confirm an electricity bill with its source evidence](https://github.com/haydenteh5526/DocVault/issues/1) | Story | Demo 1 covers read-only candidates and OCR evidence in [PR #7](https://github.com/haydenteh5526/DocVault/pull/7). Saving and reopening an owner-confirmed revision with its evidence is implemented in [PR #13](https://github.com/haydenteh5526/DocVault/pull/13). API, component and browser tests pass in CI, and the manual check with the synthetic PDF passed on merged `main` on 12 November. Closed. |
| [#2 · Allocate a confirmed bill among four housemates in cents](https://github.com/haydenteh5526/DocVault/issues/2) | Story | Use the confirmed revision from #1. Verify exact division and remainder cases, and show that the contributions sum to the total. Merged in [PR #16](https://github.com/haydenteh5526/DocVault/pull/16) (`d21d018`, 12 November 2026): saved housemate names, a server calculator in integer cents, a reviewed save bound to the confirmed revision, and stale marking. Backend, frontend and browser tests passed in CI. The manual check with the synthetic PDF passed on `1cc935b` on 12 November: €123.47 confirmed as revision 1, the four-person split €30.87, €30.87, €30.87, €30.86 saved and reloaded as split 1, a stale notice after revision 2 with the original amounts, a real two-tab conflict refused with nothing saved twice, and a stopped API keeping the review step (2 `bill_splits` rows at the end, as expected). The issue stays open for the maintainer to close. |
| [#3 · Approve and save an internal reminder exactly once](https://github.com/haydenteh5526/DocVault/issues/3) | Story | Use confirmed bill facts and any referenced allocation from #1–#2. Show the exact proposal, save once after approval, and verify cancellation, retries, stale inputs and ownership. Implemented on `feature/issue-3-reminder-approval` and awaiting review: pending proposals, approval bound to the reviewed details and the bill and split in force, a unique proposal-to-reminder link, an event history, and a Reminder panel. Local backend, frontend and browser tests and a manual check with the synthetic PDF are recorded in [Repo_Current_State.md](Repo_Current_State.md). Not yet verified: hosted CI, and the lock tests do not prove the row lock (see the recorded results). |
| [#5 · Ask about my documents and request supported actions in everyday language](https://github.com/haydenteh5526/DocVault/issues/5) | Story | Test local model feasibility early. Integrate the supported actions from #1–#3 and verify evidence, clarification, safe declines and resistance to instructions in documents. |

## How to track work

1. Use an epic for a user outcome and a story or issue for a testable increment. Put the user goal, scope, dependencies and observable acceptance checks in the issue. Use a checklist for small implementation steps and a separate issue for work that needs its own review.
2. Work in a branch and reference the issue in the pull request. For a partial increment such as Demo 1, use `Part of #1`. Use `Closes #1` only when the PR meets all of that issue's acceptance checks.
3. Record verification against the acceptance checks in the PR. Wait for the required CI checks, resolve review conversations and merge through protected `main`. Link the outcome or evidence to the issue.
4. Update this index when the epic, story breakdown or delivery dependencies change. Update the issue for progress. Record the verified result in the [repository snapshot](Repo_Current_State.md) and link the evidence.
