---
name: workflow-doc-sync
description: When a PR is being opened (pr-to-dev step), finds which vault workflow docs are stale by matching the branch diff against each machine workflow file's source: frontmatter, then hands off to the vault's workflow-documenter agent (the only thing allowed to rewrite them). Never writes to the vault. Runs once per PR over the whole diff — not per commit or per task.
---

# Workflow doc sync

This is the Claude Code adapter for a tool-agnostic skill. Read and follow
the full instructions at
[.agent/skills/workflow-doc-sync.md](../../../.agent/skills/workflow-doc-sync.md)
before proceeding — that file is the canonical, maintained version (also
used by other AI coding tools working in this repo); this file exists only
so Claude Code can discover and auto-invoke it.
