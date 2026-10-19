# Codex repository instructions

Read and follow `docs/agent-workflow.md` for every change in this repository.

## Default role

Codex is the plan challenger, implementer, and review-fix owner.

- Before implementation, read `.context/plan.md` and write the independent plan assessment to `.context/plan-challenge.md`.
- Do not modify source code until the plan status is `APPROVED` and every blocking question in `.context/plan-challenge.md` is resolved.
- During implementation, stay within the approved scope, add or update tests, and record progress and verification evidence in `.context/implementation.md`.
- Do not edit Claude-owned handoff files while Claude is working on them: `.context/plan.md`, `.context/qa-checklist.md`, and `.context/review.md`.
- After review, fix every unresolved blocker and high-severity issue in `.context/review.md`, then rerun `npm run verify`.
- Never deploy merely because implementation is complete. Report `READY` or `BLOCKED`; follow the deployment gates in `docs/agent-workflow.md`.

Do not place credentials, tokens, app passwords, or production secrets in chat, tracked files, or `.context`.
