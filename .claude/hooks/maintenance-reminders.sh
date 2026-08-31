#!/usr/bin/env bash
# Stop hook: inspect the working tree + branch diff and remind the session to
# run the matching maintenance step. Never mutates anything — it only prints a
# JSON systemMessage / additionalContext for Claude to act on.
#
# Wired from .claude/settings.json (Stop event). See AGENTS.md "Auto-run wiring".
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

base="$(git rev-parse --verify --quiet dev >/dev/null 2>&1 && echo dev || echo HEAD)"

# changed = committed-since-base ∪ staged ∪ unstaged ∪ untracked, de-duped
changed="$(
  {
    [ "$base" != HEAD ] && git diff --name-only "$base"...HEAD
    git diff --name-only HEAD
    git diff --name-only --staged
    git ls-files --others --exclude-standard
  } 2>/dev/null | sort -u
)"

[ -z "$changed" ] && exit 0

reminders=""
add() { reminders="${reminders}- $1"$'\n'; }

if grep -qE '^supabase/migrations/' <<<"$changed"; then
  add "supabase/migrations changed -> run the \`seed-sync-agent\` (reconcile supabase/seeds), then \`supabase-migration-push\` **once, at the very end** of the task."
elif grep -qE '^supabase/seeds/' <<<"$changed"; then
  add "supabase/seeds changed -> run \`npm run test:seed\`; check the \`supabase-seed-maintenance\` coverage map is still accurate."
fi

if grep -qE '^(client|server)/src/' <<<"$changed"; then
  add "app code changed -> run the \`workflow-doc-sync\` skill to check whether any vault workflow doc's \`source:\` list is now stale."
  add "if a capacity / eligibility / status / enum / role rule moved, run \`domain-doc-sync-agent\` to reconcile the .agent domain docs."
fi

[ -z "$reminders" ] && exit 0

msg="Maintenance reminders (from .claude/hooks):
${reminders}"

# jq builds valid JSON; fall back to a hand-rolled string if jq is absent.
if command -v jq >/dev/null 2>&1; then
  jq -n --arg m "$msg" \
    '{systemMessage: $m, hookSpecificOutput: {hookEventName: "Stop", additionalContext: $m}}'
else
  printf '{"systemMessage": %s}\n' "$(python -c 'import json,sys;print(json.dumps(sys.stdin.read()))' <<<"$msg")"
fi
