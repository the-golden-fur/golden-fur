---
name: pre-commit-checks
description: Runs every (check)/(fix)-labeled VS Code task (lint + format, client and server), auto-fixing what it can and surfacing what it can't. Runs as a step of pr-to-dev / pr-dev-to-main (via ci-verifier), NOT on every commit; also run it standalone on request or before opening a PR.
---

# Pre-commit checks

This is the Claude Code adapter for a tool-agnostic skill. Read and follow
the full instructions at
[.agent/skills/pre-commit-checks.md](../../../.agent/skills/pre-commit-checks.md)
before proceeding — that file is the canonical, maintained version (also
used by other AI coding tools working in this repo); this file exists only
so Claude Code can discover and auto-invoke it.
