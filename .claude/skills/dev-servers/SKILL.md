---
name: dev-servers
description: Check whether this project's client (Vite, :5173) and server (Express, :3000) dev processes are already running before starting either. Use before running `npm run dev` (or a matching background task), or when troubleshooting "it's broken"/proxy-error reports — this project has two independent dev servers and most issues are one not running or an agent starting a colliding second copy of one that's already up. This is a narrow pre-flight check, distinct from the general-purpose `run` skill (which drives the app in a browser) — use both together when verifying a UI change: this one first to confirm the servers are up, `run` after to actually look at the page.
---

# Checking this project's dev servers before starting one

This is the Claude Code adapter for a tool-agnostic skill. Read and follow
the full instructions at
[.agent/skills/dev-servers.md](../../../.agent/skills/dev-servers.md)
before proceeding — that file is the canonical, maintained version (also
used by other AI coding tools working in this repo); this file exists only
so Claude Code can discover and auto-invoke it.

The short version: **check `Get-NetTCPConnection -LocalPort 3000,5173
-State Listen` before starting anything.** If a port's already listening,
that's a running dev server — report it, don't start a competing one.
