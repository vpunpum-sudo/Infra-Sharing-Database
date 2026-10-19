#!/usr/bin/env bash
# Single-chat orchestrator for docs/agent-workflow.md.
# One chat (or terminal) drives both agents through their CLIs:
#   claude -p   -> plan, QA checklist, review   (read-only; output written by this script)
#   codex exec  -> plan challenge (read-only), implement and fix (workspace-write)
# The human plan approval and every deployment stay outside automation.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

ctx=".context"
logs="$ctx/logs"
max_rounds="${AGENT_FLOW_MAX_ROUNDS:-3}"
claude_model="${AGENT_FLOW_CLAUDE_MODEL:-}"
codex_model="${AGENT_FLOW_CODEX_MODEL:-}"

claude_read_tools="Read,Grep,Glob,Bash(git diff:*),Bash(git status:*),Bash(git log:*),Bash(git show:*),Bash(ls:*)"

usage() {
  cat <<'EOF'
Usage: scripts/agent-flow.sh <command> [args]

  plan "<task or feedback>"  Claude writes .context/plan.md, then Codex challenges it.
                             Run again with feedback to revise the plan.
  approve [--force]          Mark the plan APPROVED. Only on explicit human instruction.
  build                      Codex implements while Claude writes the QA checklist, then
                             verify -> Claude review -> Codex fix, up to AGENT_FLOW_MAX_ROUNDS.
  review                     One verify + Claude review round.
  fix                        One Codex fix round for the current review findings.
  verify                     Run npm run verify and save .context/verify.log.
  spec                       Copy the approved plan and review to docs/specs/<feature>.md.
                             build does this automatically after an approved review.
  status                     Show the status of every handoff file.
  reset                      Archive current handoff files and start a fresh feature.

Environment: AGENT_FLOW_MAX_ROUNDS (default 3), AGENT_FLOW_CLAUDE_MODEL, AGENT_FLOW_CODEX_MODEL.
Deployment is never performed by this script.
EOF
}

log() { printf '[agent-flow %s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

field() {
  # field <file> <Status|Verdict> -> first value, or MISSING
  local value
  value="$(grep -m1 -E "^$2: " "$1" 2>/dev/null | sed -E "s/^$2: *//; s/[[:space:]]+$//")" || true
  printf '%s' "${value:-MISSING}"
}

set_status() {
  local tmp
  tmp="$(mktemp)"
  sed -E "1,/^Status: /s/^Status: .*/Status: $2/" "$1" >"$tmp" && mv "$tmp" "$1"
}

# Fingerprint of tracked and untracked non-ignored files; .context is gitignored.
source_fingerprint() {
  {
    git diff HEAD --binary
    git ls-files -o --exclude-standard -z | xargs -0 shasum 2>/dev/null || true
  } | shasum | cut -d' ' -f1
}

require_cli() { command -v "$1" >/dev/null || die "'$1' CLI not found on PATH"; }

ensure_context() {
  mkdir -p "$ctx" "$logs"
  local template
  for template in docs/agent-templates/*.md; do
    [[ -e "$ctx/$(basename "$template")" ]] || cp "$template" "$ctx/"
  done
}

stamp() { date +%Y%m%d-%H%M%S; }

# install_output <tmp file> <target>: move agent output into place, ending with a newline.
install_output() {
  [[ -z "$(tail -c1 "$1")" ]] || printf '\n' >>"$1"
  mv "$1" "$2"
}

# run_claude_to_file <stage> <target file> <required line regex> <prompt>
# Claude runs with read-only tools; its final answer becomes the target file.
# Set skip_source_guard=1 when Codex may be editing files concurrently.
run_claude_to_file() {
  local stage="$1" target="$2" required="$3" prompt="$4"
  local out log_file before args
  require_cli claude
  out="$(mktemp)"
  log_file="$logs/$(stamp)-claude-$stage.log"
  before="$(source_fingerprint)"
  args=(-p --permission-mode dontAsk --allowedTools "$claude_read_tools" --no-session-persistence)
  [[ -n "$claude_model" ]] && args+=(--model "$claude_model")
  log "Claude: $stage (log: $log_file)"
  if ! claude "${args[@]}" "$prompt" >"$out" 2>"$log_file"; then
    cat "$out" >>"$log_file"
    rm -f "$out"
    die "Claude $stage failed; see $log_file"
  fi
  [[ "${skip_source_guard:-0}" == 1 || "$(source_fingerprint)" == "$before" ]] || die "Claude $stage changed repository files; inspect git status"
  cat "$out" >>"$log_file"
  grep -qE "$required" "$out" || { rm -f "$out"; die "Claude $stage output is missing '$required'; see $log_file"; }
  install_output "$out" "$target"
  log "Claude: wrote $target"
}

# run_codex <stage> <sandbox> <prompt> [output file]
run_codex() {
  local stage="$1" sandbox="$2" prompt="$3" output="${4:-}"
  local log_file args
  require_cli codex
  log_file="$logs/$(stamp)-codex-$stage.log"
  args=(exec --cd "$repo_root" --sandbox "$sandbox")
  [[ -n "$codex_model" ]] && args+=(--model "$codex_model")
  [[ -n "$output" ]] && args+=(--output-last-message "$output")
  log "Codex: $stage (log: $log_file)"
  codex "${args[@]}" "$prompt" </dev/null >"$log_file" 2>&1 || die "Codex $stage failed; see $log_file"
}

# Restore Claude-owned files if a Codex write stage touched them.
protect_claude_files() {
  local backup="$1" name
  for name in plan.md review.md; do
    if [[ -f "$backup/$name" ]] && ! cmp -s "$backup/$name" "$ctx/$name"; then
      cp "$backup/$name" "$ctx/$name"
      log "WARNING: Codex modified $ctx/$name; restored Claude's version"
    fi
  done
}

snapshot_claude_files() {
  local backup
  backup="$(mktemp -d)"
  cp "$ctx/plan.md" "$ctx/review.md" "$backup/" 2>/dev/null || true
  printf '%s' "$backup"
}

cmd_plan() {
  local request="${1:-}"
  [[ -n "$request" ]] || die 'plan requires a task description: plan "<task>"'
  ensure_context
  local current challenge prompt
  current="$(cat "$ctx/plan.md")"
  challenge="$(cat "$ctx/plan-challenge.md")"

  read -r -d '' prompt <<EOF || true
Act as requirements and architecture owner. Read docs/agent-workflow.md and explore the repository as needed.

Request from the human:
$request

Current .context/plan.md (template or previous draft):
$current

Current .context/plan-challenge.md from Codex (address its findings if relevant):
$challenge

Respond with ONLY the complete new contents of .context/plan.md in Markdown, following the
template sections exactly. Keep the line "Status: DRAFT" and directly below it add or keep
"Feature: <short-kebab-case-name>" naming this change. Do not wrap the answer in a code fence
and do not add commentary before or after it. You cannot edit files; this script saves your answer.
EOF
  run_claude_to_file plan "$ctx/plan.md" '^Status: DRAFT' "$prompt"

  local out
  out="$(mktemp)"
  read -r -d '' prompt <<'EOF' || true
Act as plan challenger. Read docs/agent-workflow.md, AGENTS.md, .context/plan.md, and the
relevant source. Do not modify any files.

Your final message must be ONLY the complete contents of .context/plan-challenge.md following
.context/plan-challenge.md's template sections. Set "Status: DONE". Set the last line to
"Verdict: READY" when there are no blocking questions, otherwise "Verdict: BLOCKED" and list
each blocking question under "Blocking questions". No code fences, no extra commentary.
EOF
  run_codex challenge read-only "$prompt" "$out"
  grep -qE '^Verdict: (READY|BLOCKED)' "$out" || { rm -f "$out"; die "Codex challenge output has no Verdict line"; }
  install_output "$out" "$ctx/plan-challenge.md"

  log "Plan: $(field "$ctx/plan.md" Status) | Challenge: $(field "$ctx/plan-challenge.md" Verdict)"
  log "Next: human reviews .context/plan.md and .context/plan-challenge.md, then runs 'approve' or 'plan \"<feedback>\"'."
}

cmd_approve() {
  ensure_context
  local verdict
  verdict="$(field "$ctx/plan-challenge.md" Verdict)"
  if [[ "$verdict" != READY && "${1:-}" != --force ]]; then
    die "Challenge verdict is $verdict. Resolve blocking questions with 'plan \"<answers>\"' or use 'approve --force'."
  fi
  [[ "$(field "$ctx/plan.md" Status)" != MISSING ]] || die "No Status line in $ctx/plan.md"
  set_status "$ctx/plan.md" APPROVED
  log "Plan APPROVED. Next: build"
}

cmd_verify() {
  ensure_context
  local log_file="$ctx/verify.log" code=0
  log "Running npm run verify"
  {
    echo "Command: npm run verify"
    echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "HEAD: $(git rev-parse --short HEAD)  Working tree fingerprint: $(source_fingerprint)"
    echo
  } >"$log_file"
  npm run verify >>"$log_file" 2>&1 || code=$?
  echo "Exit code: $code" >>"$log_file"
  log "verify exit code: $code (log: $log_file)"
  return "$code"
}

cmd_review() {
  ensure_context
  local prompt verify_result=PASSED
  cmd_verify || verify_result=FAILED

  read -r -d '' prompt <<EOF || true
Act as independent reviewer. Read docs/agent-workflow.md, .context/plan.md,
.context/qa-checklist.md, .context/implementation.md, and the previous .context/review.md.
Review the ACTUAL changes with git diff / git status (including untracked files), not only
Codex's summary. Fresh verification output is in .context/verify.log (result: $verify_result).

Respond with ONLY the complete new contents of .context/review.md following its template.
Classify each finding as BLOCKER, HIGH, MEDIUM, or LOW with file:line references.
Set both "Status:" and the final "Verdict:" line to APPROVED only if there are no unresolved
BLOCKER or HIGH findings and verification passed; otherwise CHANGES_REQUESTED.
No code fences, no commentary. You cannot edit files; this script saves your answer.
EOF
  run_claude_to_file review "$ctx/review.md" '^Verdict: (APPROVED|CHANGES_REQUESTED)' "$prompt"
  log "Review verdict: $(field "$ctx/review.md" Verdict)"
}

cmd_fix() {
  ensure_context
  local backup prompt
  backup="$(snapshot_claude_files)"
  read -r -d '' prompt <<'EOF' || true
Act as review-fix owner. Read docs/agent-workflow.md, .context/review.md, and
.context/verify.log. Fix every unresolved BLOCKER and HIGH finding (and verification
failures), add regression tests, run the relevant focused tests and npm run verify, and update
.context/implementation.md including the review-fix log and fresh verification evidence.
Set its status to READY_FOR_REVIEW. Do not edit .context/plan.md, .context/qa-checklist.md,
or .context/review.md. Do not commit, push, or deploy.
EOF
  run_codex fix workspace-write "$prompt"
  protect_claude_files "$backup"
  rm -rf "$backup"
  log "Implementation: $(field "$ctx/implementation.md" Status)"
}

cmd_build() {
  ensure_context
  [[ "$(field "$ctx/plan.md" Status)" == APPROVED ]] || die "Plan is not APPROVED. Run 'approve' after human sign-off."

  local backup prompt qa_pid qa_code=0 build_code=0
  backup="$(snapshot_claude_files)"

  read -r -d '' prompt <<'EOF' || true
Act as QA designer. Read docs/agent-workflow.md and the approved .context/plan.md.
Respond with ONLY the complete contents of .context/qa-checklist.md following its template:
acceptance scenarios tied to each acceptance criterion, edge cases, security/permission checks,
and regression areas. Set "Status: READY". No code fences, no commentary.
EOF
  ( skip_source_guard=1 run_claude_to_file qa "$ctx/qa-checklist.md" '^Status: ' "$prompt" ) &
  qa_pid=$!

  read -r -d '' prompt <<'EOF' || true
Act as implementer. Read docs/agent-workflow.md, AGENTS.md, .context/plan.md (APPROVED), and
.context/plan-challenge.md. Implement only the approved scope, add or update tests, run the
relevant focused tests, and maintain .context/implementation.md with files changed, tests, and
verification evidence. Set its status to READY_FOR_REVIEW when done. Do not edit
.context/plan.md, .context/qa-checklist.md, or .context/review.md. Do not commit, push, or deploy.
EOF
  ( run_codex implement workspace-write "$prompt" ) || build_code=$?

  wait "$qa_pid" || qa_code=$?
  protect_claude_files "$backup"
  rm -rf "$backup"
  [[ "$build_code" -eq 0 ]] || die "Implementation stage failed"
  [[ "$qa_code" -eq 0 ]] || log "WARNING: QA checklist stage failed; review continues without it"

  local round
  for ((round = 1; round <= max_rounds; round++)); do
    log "Review round $round/$max_rounds"
    cmd_review
    if [[ "$(field "$ctx/review.md" Verdict)" == APPROVED ]]; then
      log "Review APPROVED and npm run verify passed. Ready for human merge/deploy decision."
      cmd_spec
      cmd_status
      return 0
    fi
    [[ "$round" -lt "$max_rounds" ]] && cmd_fix
  done
  cmd_status
  die "Review still CHANGES_REQUESTED after $max_rounds rounds; human decision needed"
}

# Shift Markdown headings down one level, outside code fences.
demote_headings() {
  awk '/^```/ { fence = !fence } !fence && /^#/ { $0 = "#" $0 } { print }' "$1"
}

cmd_spec() {
  ensure_context
  [[ "$(field "$ctx/review.md" Verdict)" == APPROVED ]] || die "Review is not APPROVED; nothing to archive"
  local feature target
  feature="$(field "$ctx/plan.md" Feature)"
  [[ "$feature" =~ ^[a-z0-9][a-z0-9-]*$ ]] || feature="$(date +%Y%m%d)-unnamed-feature"
  target="docs/specs/$feature.md"
  mkdir -p docs/specs
  {
    echo "# $feature"
    echo
    echo "Archived by \`scripts/agent-flow.sh\` on $(date +%Y-%m-%d) after an approved review."
    echo
    echo "- Branch: \`$(git branch --show-current)\`"
    echo "- Base commit: \`$(git rev-parse --short HEAD)\`"
    if [[ -f "$ctx/verify.log" ]]; then
      echo "- Verification: \`npm run verify\`, $(grep -m1 '^Started:' "$ctx/verify.log"), $(tail -1 "$ctx/verify.log")"
    fi
    echo
    demote_headings "$ctx/plan.md"
    echo
    demote_headings "$ctx/review.md"
  } >"$target"
  log "Spec saved to $target (commit it with the change)"
}

cmd_status() {
  ensure_context
  local name
  for name in plan plan-challenge implementation qa-checklist review; do
    printf '%-16s Status: %-18s Verdict: %s\n' "$name" \
      "$(field "$ctx/$name.md" Status)" "$(field "$ctx/$name.md" Verdict)"
  done
  [[ -f "$ctx/verify.log" ]] && printf '%-16s %s\n' verify "$(tail -1 "$ctx/verify.log")"
  return 0
}

cmd_reset() {
  ensure_context
  local archive="$ctx/archive/$(stamp)" template
  mkdir -p "$archive"
  for template in docs/agent-templates/*.md; do
    mv "$ctx/$(basename "$template")" "$archive/" 2>/dev/null || true
    cp "$template" "$ctx/"
  done
  [[ -f "$ctx/verify.log" ]] && mv "$ctx/verify.log" "$archive/"
  log "Archived previous handoff files to $archive"
}

command="${1:-}"
[[ $# -gt 0 ]] && shift
case "$command" in
  plan) cmd_plan "$*" ;;
  approve) cmd_approve "${1:-}" ;;
  build) cmd_build ;;
  review) cmd_review ;;
  fix) cmd_fix ;;
  verify) cmd_verify ;;
  spec) cmd_spec ;;
  status) cmd_status ;;
  reset) cmd_reset ;;
  -h | --help | help | "") usage ;;
  *) usage; exit 2 ;;
esac
