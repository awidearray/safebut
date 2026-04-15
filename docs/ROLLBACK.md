# Rollback Procedure

Use this when a merge to `main` causes production regression.

## Immediate rollback (manual)

1. Identify bad merge commit SHA from `main`.
2. Create rollback branch from latest `main`.
3. Revert the offending commit:
   - `git revert <sha>`
   - For multi-commit rollback: revert in reverse order.
4. Run verification:
   - `npm ci`
   - `npm test`
5. Open PR titled `rollback: revert <sha>`.
6. Merge once checks pass.

## Emergency direct rollback (if policy allows)

If branch protections are temporarily bypassed for incident response:

1. Revert commit locally on `main`.
2. Run tests.
3. Push revert commit immediately.
4. Open post-incident follow-up PR restoring normal controls.

## Validation / drills

- Automated rollback simulation runs weekly and on manual dispatch:
  - Workflow: `.github/workflows/rollback-drill.yml`
  - Script: `scripts/rollback-drill.sh`
- The drill verifies that reverting `HEAD` can still pass `npm test`.
