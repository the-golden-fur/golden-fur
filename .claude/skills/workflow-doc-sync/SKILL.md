---
name: workflow-doc-sync
description: After a code change, finds which vault workflow docs are stale by matching changed paths against each machine workflow file's source: frontmatter, then hands off to the vault's workflow-documenter agent (the only thing allowed to rewrite them). Never writes to the vault. Use whenever a task changed code a documented business-process workflow describes.
---

# Workflow doc sync

This is the Claude Code adapter for a tool-agnostic skill. Read and follow
the full instructions at
[.agent/skills/workflow-doc-sync.md](../../../.agent/skills/workflow-doc-sync.md)
before proceeding — that file is the canonical, maintained version (also
used by other AI coding tools working in this repo); this file exists only
so Claude Code can discover and auto-invoke it.
