#!/usr/bin/env bash
# PreToolUse hook on ExitPlanMode: refuse to exit the harness's built-in Plan
# Mode until a durable plan record exists in the sibling golden-fur-vault repo
# (Projects/golden-fur/sessions/NN-<slug>/plan.md). The ephemeral
# ~/.claude/plans/*.md file the harness writes on its own is machine-local and
# not version-controlled - this hook makes sure every approved plan also lands
# in the vault, which is what session-documenter/the session record system
# actually reads later.
#
# This only gates the harness's Plan Mode toggle. The repo's own `/plan`
# skill (see .agent/skills/plan.md) already writes straight to the vault and
# never reaches this tool, so it is unaffected.
#
# Wired from .claude/settings.json (PreToolUse, matcher "ExitPlanMode").
set -euo pipefail

vault_dir="$CLAUDE_PROJECT_DIR/../golden-fur-vault"
sessions_dir="$vault_dir/Projects/golden-fur/sessions"

json_escape() {
  # No jq/python dependency guaranteed in this environment (confirmed absent
  # here) - the reason string is entirely our own text (no untrusted input),
  # so plain sed escaping of the JSON-significant characters it can contain
  # is sufficient.
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="$(printf '%s' "$s" | sed ':a;N;$!ba;s/\n/\\n/g')"
  printf '"%s"' "$s"
}

allow() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}\n'
  exit 0
}

deny() {
  local reason_json
  reason_json="$(json_escape "$1")"
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\n' "$reason_json"
  exit 0
}

if [ ! -d "$vault_dir/.git" ]; then
  # Vault repo not present at the expected sibling path - fail open rather
  # than block every ExitPlanMode call in an environment without it.
  exit 0
fi

cd "$vault_dir"

# A plan.md counts if git sees it as new or modified right now (this
# session's own write, not yet committed). `-uall` is required so a
# brand-new session folder's plan.md is listed individually instead of git
# collapsing the whole new directory into one line - file mtime is NOT a
# reliable signal here: `git checkout`/`pull`/branch-switch touch mtimes of
# unrelated unchanged files too, so an mtime-based check would false-positive
# on any recent git operation, not just a genuine new plan.
has_pending_plan="$(git status --porcelain -uall -- Projects/golden-fur/sessions 2>/dev/null | grep -E 'plan\.md$' || true)"

if [ -n "$has_pending_plan" ]; then
  allow
fi

latest_plan_commit_epoch="$(git log -1 --format=%ct -- 'Projects/golden-fur/sessions/*/plan.md' 2>/dev/null || true)"
now_epoch="$(date +%s)"

if [ -n "$latest_plan_commit_epoch" ] && [ $((now_epoch - latest_plan_commit_epoch)) -lt 3600 ]; then
  allow
fi

next_nn="$(ls "$sessions_dir" 2>/dev/null | grep -oE '^[0-9]+' | sort -n | tail -1)"
next_nn="${next_nn:-0}"
next_nn=$((next_nn + 1))

deny "No vault session plan.md found or recently touched under golden-fur-vault/Projects/golden-fur/sessions/. Per standing instruction, the final plan must be written there BEFORE exiting Plan Mode: create golden-fur-vault/Projects/golden-fur/sessions/${next_nn}-<slug>/plan.md (near-beginner style, per .agent/skills/session-documentation.md's template - same content as the plan file you're about to submit here), then retry ExitPlanMode."
