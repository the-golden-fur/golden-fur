#!/usr/bin/env bash
# UserPromptSubmit hook: deterministically route the session by what the user
# just asked for. It only *decides* and injects guidance as additionalContext
# - the probabilistic skills/agents still do the work. Never blocks the prompt.
#
# Two routes:
#   plan-only  -> the `plan` skill, no code edits
#   finish/PR  -> the locked finish pipeline (branch -> verify -> ci-fixer ->
#                 code-review -> commit -> push -> PR, then the vault)
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
  emit "SESSION-FINISH MODE (session-router hook matched this prompt). Run the locked pipeline in order - do not skip a step, do not run these earlier for a non-PR request:
1. branch: if HEAD is dev/main, run \`branch-naming\` to create+push a branch first.
2. verify: spawn \`ci-verifier\` across BOTH repos.
3. ci-fixer: if verify is red, spawn \`ci-fixer-agent\`, then re-run \`ci-verifier\` until green.
4. code review: spawn \`code-reviewer\` on dev...HEAD + working tree; resolve every Blocking finding.
5. workflow docs: if client/src|server/src|supabase/migrations changed and workflow-doc-sync hasn't run this session, run it now.
6. session record: confirm golden-fur-vault/Projects/golden-fur/sessions/NN-<slug>/ (plan.md + testing/ + reviews/ + context/) exists and is current (session-documenter) - write/update it if not.
7. commit: run the \`commit\` skill (captures impl + ci-fixer + review fixes).
8. push.
9. PR: \`pr-to-dev\` (feature->dev) or \`pr-dev-to-main\` (dev->main).
10. vault: commit + push + \`pr\` for the sessions/ + reviews/ + Reference/ changes.
The \`pr-guard\` hook will block \`gh pr create\` until steps 2 and 4 have left their evidence."
  exit 0
fi

exit 0
