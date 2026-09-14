#!/usr/bin/env bash
# UserPromptSubmit hook: deterministically route the session by what the user
# just asked for. It only *decides* and injects guidance as additionalContext
# - the probabilistic skills/agents still do the work. Never blocks the prompt.
#
# Two routes:
#   plan-only  -> the `plan` skill, no code edits
#   finish/PR  -> branch (if needed) -> commit -> push -> open a draft PR.
#                 No CI / verify / code-review step - the user runs those
#                 manually after the PR exists.
#
# Wired from .claude/settings.json (UserPromptSubmit). See AGENTS.md
# "Auto-run wiring". Mirrored in golden-fur-vault/.claude/hooks/.
set -euo pipefail

payload="$(cat)"
if command -v jq >/dev/null 2>&1; then
  prompt="$(jq -r '.prompt // empty' <<<"$payload")"
else
  prompt="$(sed -n 's/.*"prompt"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p' <<<"$payload")"
fi
[ -z "$prompt" ] && exit 0

lc="$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')"

emit() {
  # $1 = context string
  if command -v jq >/dev/null 2>&1; then
    jq -n --arg c "$1" \
      '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $c}}'
  else
    printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":%s}}\n' \
      "$(python -c 'import json,sys;print(json.dumps(sys.stdin.read()))' <<<"$1")"
  fi
}

# --- plan-only ------------------------------------------------------------
if printf '%s' "$lc" | grep -qE "(^|[^a-z])(/plan|just plan|plan only|plan first|don'?t touch code|do not touch code|no code( yet)?|planning only)([^a-z]|$)"; then
  emit "PLAN-ONLY MODE (session-router hook matched this prompt).
- Use the \`plan\` skill (canonical: golden-fur-vault/.agent/skills/plan.md). Use the built-in \`Plan\` agent for the design pass.
- Do NOT edit, create, or delete any code file (client/, server/, supabase/, anything in golden-fur).
- Reserve the next session number: list golden-fur-vault/Projects/golden-fur/sessions/ + sessions/_legacy/{custom,issues}/, take max NN + 1.
- Write only golden-fur-vault/Projects/golden-fur/sessions/NN-<slug>/plan.md, for a near-beginner (define every term, name the real screens/roles).
- Stop after the plan; tell the user where it is and that NN is reserved."
  exit 0
fi

# --- finish / open a PR --------------------------------------------------
if printf '%s' "$lc" | grep -qE "(^|[^a-z])(/pr|open (a|the) pr|make (a|the) pr|create (a|the) pull request|raise (a|the) pr|pr this|ready to pr|let'?s pr|ship it|finish (up )?and pr)([^a-z]|$)"; then
  emit "OPEN-A-PR MODE (session-router hook matched this prompt). Run once, then hand back the PR link - do NOT run CI, verify, lint, format, build, code-review, or workflow-doc checks, and do NOT spawn any verifier/fixer subagent. The user runs those manually after the PR exists.
1. branch: if HEAD is dev/main, run \`branch-naming\` to create+push a branch first.
2. commit: run the \`commit\` skill for any outstanding work (skip if the tree is clean).
3. push the branch.
4. PR: \`pr-to-dev\` (feature->dev) or \`pr-dev-to-main\` (dev->main) - opens a DRAFT PR with title, body, labels, assignee, and milestone all set.
5. vault: if this session changed golden-fur-vault, commit + push + open its draft PR with the \`pr\` skill there.
Then stop."
  exit 0
fi

exit 0
