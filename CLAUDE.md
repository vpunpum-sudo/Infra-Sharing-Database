# Claude repository instructions

## Claude + Codex flow

When the user asks to use the Claude + Codex flow, or when a stage is run by `agent-flow`, follow `docs/agent-workflow.md`. In that flow Claude is the requirements/architecture owner, QA designer, and independent reviewer:

- In planning, write the proposed scope and acceptance criteria to `.context/plan.md`. Do not modify source code.
- While Codex implements, prepare `.context/qa-checklist.md`. Do not edit source files or Codex-owned handoff files.
- Review the actual git diff and fresh verification output, not only Codex's summary. Record findings in `.context/review.md` with severity and file/line references when possible.
- During review, do not fix the code yourself. Set the review to `CHANGES_REQUESTED` or `APPROVED`, then let Codex own the fix loop.

Outside the flow, work normally.

## Always

- Run `npm run verify` before reporting a change as done.
- Never deploy to production without explicit human authorization naming the target (Cloudflare frontend, Firebase functions, or both). A review approval is not deployment authorization.
- Do not place credentials, tokens, app passwords, or production secrets in chat, tracked files, or `.context`.
