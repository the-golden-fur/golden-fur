---
name: commit
description: Create a conventional-commit-style git commit for the current changes. ONLY when the user explicitly asks to commit ("commit this", "/commit") — never invoke proactively, never as a task wrap-up step. Performs the actual commit, not just a drafted message.
---

# Commit

This is the Claude Code adapter for a tool-agnostic skill. Read and follow
the full instructions at
[.agent/skills/commit.md](../../../.agent/skills/commit.md) before
proceeding — that file is the canonical, maintained version (also used by
other AI coding tools working in this repo); this file exists only so
Claude Code can discover it **when the user explicitly asks to commit**.
Do not invoke it on your own initiative.
