# GitHub Feature Branch -> Main Workflow

This repository uses the following enforced workflow:

1. Create feature branch from latest `main`.
2. Implement in atomic commits with clear commit messages.
3. Push branch to `origin` frequently.
4. Ensure local tests pass (`npm test`).
5. Open PR to `main` with complete PR template.
6. Link PR to ticket/issue (`Closes #...`, URL, or `ABC-123` style ID).
7. Request required reviewers.
8. Wait for CI and governance checks to pass.
9. Address review comments with follow-up commits.
10. Merge only after approvals and green checks (squash/rebase preferred).
11. Delete feature branch after merge (automated by workflow).
12. Create a version tag after merged PR (automated by workflow).

## Enforcement in this repo

- CI: `.github/workflows/ci.yml`
- PR policy checks: `.github/workflows/pr-governance.yml`
- Branch cleanup + tagging: `.github/workflows/post-merge-hygiene.yml`
- Rollback drill: `.github/workflows/rollback-drill.yml`

## Required repository settings (GitHub UI)

These are not fully enforceable from code alone and should be enabled in GitHub:

- Branch protection on `main`
  - Require pull request before merging
  - Require approvals (at least 1)
  - Require status checks to pass (`CI`, `PR Governance`)
  - Require branches to be up to date before merging
- Enable auto-delete head branches (optional; workflow already does this)
- Disable merge-commit strategy if you want squash/rebase only
