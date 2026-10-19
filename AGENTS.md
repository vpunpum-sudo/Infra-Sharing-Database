# Codex repository instructions

## Claude + Codex flow

When the user asks to use the Claude + Codex flow, or when a stage is run by `agent-flow`, follow `docs/agent-workflow.md`. In that flow Codex is the plan challenger, implementer, and review-fix owner:

- Before implementation, read `.context/plan.md` and write the independent plan assessment to `.context/plan-challenge.md`.
- Do not modify source code until the plan status is `APPROVED` and every blocking question in `.context/plan-challenge.md` is resolved.
- During implementation, stay within the approved scope, add or update tests, and record progress and verification evidence in `.context/implementation.md`.
- Do not edit Claude-owned handoff files: `.context/plan.md`, `.context/qa-checklist.md`, and `.context/review.md`.
- After review, fix every unresolved blocker and high-severity issue in `.context/review.md`, then rerun `npm run verify`.
- Report `READY` or `BLOCKED`; never deploy merely because implementation is complete.

Outside the flow, work normally.

## Always

- Run `npm run verify` before reporting a change as done.
- Never deploy to production without explicit human authorization naming the target (Cloudflare frontend, Firebase functions, or both).
- Do not place credentials, tokens, app passwords, or production secrets in chat, tracked files, or `.context`.
