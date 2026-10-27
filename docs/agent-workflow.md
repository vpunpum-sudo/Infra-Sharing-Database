# Claude + Codex delivery workflow

Use this workflow when a change is delivered through the Claude + Codex flow (two chats or `agent-flow`), one shippable change per Conductor workspace. Claude and Codex share the workspace, branch, working tree, and `.context` handoff files, but each artifact has one owner.

## Roles and ownership

| Area | Owner | Required artifact |
| --- | --- | --- |
| Requirements, scope, architecture | Claude | `.context/plan.md` |
| Independent plan challenge | Codex | `.context/plan-challenge.md` |
| Human plan decision | Human | `Status: APPROVED` in `.context/plan.md` |
| Implementation and automated tests | Codex | Code plus `.context/implementation.md` |
| QA scenarios and edge cases | Claude | `.context/qa-checklist.md` |
| Independent diff review | Claude | `.context/review.md` |
| Review fixes | Codex | Code plus updated `.context/implementation.md` |
| Deterministic verification | Automation | `npm run verify` |
| Staging/production decision | Human + CI/CD | Explicit authorization and green checks |

Only the owner edits an artifact while a stage is active. Agents may read every artifact.

## Stage gates

### 1. Plan

Claude writes `.context/plan.md` with the objective, scope, acceptance criteria, design, risks, expected files, verification commands, and deployment target. Its initial status is `DRAFT`.

Claude does not modify source code during this stage.

### 2. Challenge

Codex reads the plan and repository, then writes `.context/plan-challenge.md`. It checks feasibility, hidden dependencies, migration/security risks, testability, and unnecessary scope.

Codex does not modify source code during this stage. A human resolves blocking questions and changes the plan status to `APPROVED`.

### 3. Build and QA design

After approval, these streams may run at the same time:

- Codex implements the approved scope, adds tests, and updates `.context/implementation.md`.
- Claude creates `.context/qa-checklist.md` from the acceptance criteria, without changing source code.

Codex sets implementation status to `READY_FOR_REVIEW` only after running relevant focused tests. The complete repository gate is still `npm run verify`.

### 4. Independent review

Claude waits for `READY_FOR_REVIEW`, then reviews the actual diff and fresh command output. Claude writes findings to `.context/review.md` as `BLOCKER`, `HIGH`, `MEDIUM`, or `LOW` and sets the status to either `CHANGES_REQUESTED` or `APPROVED`.

Claude does not fix reviewed code. Codex owns fixes so the review remains independent. Repeat the fix/review loop until there are no unresolved blocker or high-severity findings.

### 5. Verification

Run:

```bash
npm run verify
```

The command must finish successfully in the current workspace. Record the exact command and result in `.context/implementation.md`. A summary from an earlier run is not evidence.

### 6. Deploy

Deployment is deliberately not part of `npm run verify`.

- The request must identify the target: Cloudflare frontend, Firebase functions, or both.
- Staging deployment requires explicit task authorization and a named target.
- Production deployment requires green checks, an approved Claude review, resolved Conductor todos, and explicit human authorization.
- Prefer CI/CD or a documented repository command. Never infer credentials, project IDs, or production targets.
- After deployment, validate the deployed environment and record the URL/version and smoke-test evidence.

For approval-email functions, also follow `APPROVAL_EMAIL_SETUP.md`.

### Firestore rules changes

`npm run verify` cannot exercise `firestore.rules`. Any change to that file also needs:

- `npm run test:rules` green. It runs `tests/rules/` on the Firestore emulator in Enterprise edition against the
  named database, replays the real client writes against the previous rules (`tests/rules/fixtures/firestore.rules.before`)
  and the current ones, and fails on any outcome that differs from the declared table in `tests/rules/expectations.mjs`.
  It needs a JRE (Java 21 works) and the `firebase` CLI, and it is not part of `npm run verify`. A sandbox that forbids
  opening local sockets (such as the Codex stage sandbox) cannot run it: run it from a normal shell.
- A PR description that says plainly: which rule gates changed, that the rules were NOT deployed (rules deploy is a
  production change to a shared database and needs authorization naming "Firestore rules" and the project), the
  rollback (redeploy the previous `firestore.rules` from git), and the post-deploy checklist from the spec.
- Rules have a hard budget of 1,000 evaluated expressions and 10 distinct document reads per request. The suite's
  budget test (`limits.rules.test.mjs`) keeps a margin; when a change eats it, restructure instead of lowering the margin.

## Conductor merge-gate todos

Create these todos for each feature and treat open items as blockers:

- Acceptance criteria approved
- Plan challenged and blocking questions resolved
- Implementation and focused tests complete
- Independent review approved
- `npm run verify` green
- Staging verified, when applicable
- Production explicitly approved, when applicable

Mention `@todos` when handing a stage to an agent so it receives the current list.

## Single-chat mode

The global `agent-flow` CLI (installed on the developer machine from `~/agent-flow`) drives both agents from one chat through their CLIs. In this repository it uses `docs/agent-templates/`, these rules, and `npm run verify` as the gate. Ownership is unchanged: Claude stages run read-only, Codex implements in a sandbox, plan approval stays with the human, and it never deploys.

```bash
agent-flow plan "<task>"       # Claude plan, then Codex challenge
agent-flow approve             # human gate: run only on explicit human approval
agent-flow build               # implement + QA, then verify/review/fix loop
agent-flow status
```

After an approved `build`, commit `docs/specs/<feature>.md` with the change. `.context/` is not tracked and is lost with the workspace. Run `agent-flow help` for every command.

## Copy-paste prompts

### Claude — plan

```text
Act as requirements and architecture owner. Read docs/agent-workflow.md.
Analyze this task and write .context/plan.md using the existing template.
Do not modify source code. Stop when the plan is ready for Codex challenge.
```

### Codex — challenge and build

```text
Act as plan challenger. Read docs/agent-workflow.md and .context/plan.md.
Write .context/plan-challenge.md without modifying source code.
After a human changes the plan status to APPROVED, implement only the approved
scope, add tests, and maintain .context/implementation.md.
```

### Claude — QA and review

```text
While Codex implements, derive .context/qa-checklist.md from the approved plan
without changing source code. When implementation status is READY_FOR_REVIEW,
review the actual diff and fresh verification evidence, then write
.context/review.md. Do not fix the reviewed code yourself.
```

### Codex — fix loop

```text
Read .context/review.md. Fix every unresolved BLOCKER and HIGH finding, add
regression tests, run npm run verify, and update .context/implementation.md.
Do not deploy. Return READY_FOR_REVIEW for the next independent review.
```
