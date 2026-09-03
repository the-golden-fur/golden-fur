---
name: gitkeep-empty-dir
description: Add a .gitkeep to a specific directory that is deliberately, permanently meant to ship empty. Use only on an explicit request to keep an empty folder tracked in git — never for a folder that's simply not filled in yet mid-task.
---

# Keep an empty directory in git

This is the Claude Code adapter for a tool-agnostic skill. Read and follow
the full instructions at
[.agent/skills/gitkeep-empty-dir.md](../../../.agent/skills/gitkeep-empty-dir.md)
before proceeding — that file is the canonical, maintained version (also
used by other AI coding tools working in this repo); this file exists only
so Claude Code can discover and auto-invoke it.

Explicit-request only. Never run this unprompted just because you notice an
empty directory — a folder you or another agent created this session and
haven't populated yet must stay untracked and empty, not get a `.gitkeep`.
