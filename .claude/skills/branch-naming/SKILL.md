---
name: branch-naming
description: Generate a git branch name and create/push it from a change description. Use when starting new work — creating a branch, naming a branch, "start a branch for X". Branches from dev, except hotfix/ which branches from main.
---

# Branch naming & creation

This is the Claude Code adapter for a tool-agnostic skill. Read and follow
the full instructions at
[.agent/skills/branch-naming.md](../../../.agent/skills/branch-naming.md)
before proceeding — that file is the canonical, maintained version (also
used by other AI coding tools working in this repo); this file exists only
so Claude Code can discover it. Create a branch when the user asks, or once
(unprompted) when about to edit on `dev`/`main` — but never chain a commit
onto it as an automatic step.
