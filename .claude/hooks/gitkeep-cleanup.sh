#!/usr/bin/env bash
# Stop hook: remove a now-redundant .gitkeep once its directory has real
# content. This is cleanup only, never creation — a directory that's empty
# because work on it isn't finished yet must NOT get a .gitkeep just because
# a Stop fired mid-task. Adding one is a deliberate, explicit act (the
# gitkeep-empty-dir skill, run on request) for a directory that's meant to
# ship empty by design — never something this hook infers on its own.
# Idempotent; stages its own changes.
#
# Wired from .claude/settings.json (Stop). See AGENTS.md "Auto-run wiring".
set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
changed=0

# Dirs that hold a .gitkeep AND at least one other tracked/addable file.
while IFS= read -r d; do
  [ -n "$d" ] && [ -f "$d/.gitkeep" ] || continue
  git rm -q --ignore-unmatch "$d/.gitkeep" >/dev/null 2>&1 || rm -f "$d/.gitkeep"
  changed=1
done < <(
  { git ls-files; git ls-files --others --exclude-standard; } 2>/dev/null | sort -u \
  | awk -F/ '
      { if (NF < 2) dir="."; else { dir=$1; for (i=2;i<NF;i++) dir=dir"/"$i }
        if ($NF==".gitkeep") { if (!(dir in o)) o[dir]=0; k[dir]=1 } else o[dir]++ }
      END { for (d in k) if (o[d]+0 > 0) print d }'
)

[ "$changed" -eq 0 ] && exit 0

msg=".gitkeep cleanup (from .claude/hooks): removed stray .gitkeep placeholder(s) from dir(s) that now have real content. Staged with your changes. (This hook only removes — it never adds one; use the gitkeep-empty-dir skill on request for a folder meant to ship empty.)"
if command -v jq >/dev/null 2>&1; then
  jq -n --arg m "$msg" '{systemMessage: $m}'
else
  printf '{"systemMessage": %s}\n' "$(python -c 'import json,sys;print(json.dumps(sys.stdin.read()))' <<<"$msg")"
fi
