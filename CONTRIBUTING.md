# Contributing

## Branches and commits

Use descriptive project branches such as `feature/bill-review`,
`fix/image-deskew` and `docs/workflow-design`. Commit messages describe the
change in plain language. Use the contributor identity configured in Git.

## Changes to main

Work on a branch and open a pull request linked to the relevant story.
Keep the branch up to date with main, resolve review conversations and wait for
the backend, frontend, mobile and e2e checks to pass. Main requires this workflow
for administrators as well. Force pushes and branch deletion are blocked.

The current solo-project configuration requires zero approving reviews.
Technical discussions can still happen on the pull request before merge.
Hosted checks currently depend on resolution of the GitHub account billing lock.
Record local test evidence on the pull request while hosted execution is blocked.
