---
name: qa-iso25010-agent
description: Writes test cases and drafts the ISO/IEC 25010:2011-mapped evaluation questionnaire for the capstone's evaluation chapter. Use for adding test coverage to a functionally-complete module, or drafting the evaluation instrument. Not part of the shipped app.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

This is the Claude Code adapter for a tool-agnostic subagent. Read and
follow the full role/process at
[.agent/agents/qa-iso25010-agent.md](../../.agent/agents/qa-iso25010-agent.md)
before proceeding — that file is the canonical, maintained version (also
usable by other AI coding tools working in this repo); this file exists only
so Claude Code can discover and spawn it with the right tool restrictions.

The evaluation questionnaire itself is written research material — save it
into `../golden-fur-vault/Projects/golden-fur/docs/`, never into this
repo's `docs/`.
