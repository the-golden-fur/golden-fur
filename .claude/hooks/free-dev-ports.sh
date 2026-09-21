#!/usr/bin/env bash
# Stop hook: free ports 3000 and 5173 every time Claude finishes responding,
# as a backstop specifically for agent-started dev servers (see "Dev server
# port check" - if a background `npm run dev` is left running past a turn,
# the next turn's dev server bumps to 5174+ and CORS/proxy breaks).
#
# Deliberately a plain hook script, not a call into scripts/free-ports.mjs -
# that script stays as-is and keeps doing its own job (wired as `predev` in
# client/ and server/, which is what actually prevents EADDRINUSE when a
# person runs `npm run dev` themselves). This hook only needs "kill whatever
# is LISTENING on 3000/5173 right now", so it doesn't need Node or the
# predev script's argv/reuse-as-a-library shape.
#
# Wired from .claude/settings.json (Stop).
set -uo pipefail

ports=(3000 5173)

kill_listeners() {
  local port="$1"
  local pid

  if command -v netstat >/dev/null 2>&1 && [[ "$OSTYPE" == msys* || "$OSTYPE" == cygwin* || "$OSTYPE" == win32* ]]; then
    # No -p tcp filter: it silently excludes IPv6 listeners on Windows
    # (`[::1]:5173`, the common case whenever localhost resolves to ::1
    # first) - see scripts/free-ports.mjs for the same fix and fuller
    # writeup. LISTENING is TCP-only already, so nothing else changes.
    while read -r pid; do
      [ -n "$pid" ] && [ "$pid" != "0" ] && taskkill //PID "$pid" //T //F >/dev/null 2>&1
    done < <(netstat -ano 2>/dev/null | grep -E "LISTENING" | grep -E "[:.]${port} " | awk '{print $NF}' | sort -u)
  elif command -v lsof >/dev/null 2>&1; then
    while read -r pid; do
      [ -n "$pid" ] && kill -9 "$pid" >/dev/null 2>&1
    done < <(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null)
  fi
}

for port in "${ports[@]}"; do
  kill_listeners "$port"
done

exit 0
