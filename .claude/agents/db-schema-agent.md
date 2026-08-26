---
name: db-schema-agent
description: Helps design and write migration scripts for the pets/clients/bookings/credits schema and multi-branch data isolation, run locally against the dev database. Use whenever adding or changing a table, or reviewing a migration before it merges.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

This is the Claude Code adapter for a tool-agnostic subagent. Read and
follow the full role/process at
[.agent/agents/db-schema-agent.md](../../.agent/agents/db-schema-agent.md)
before proceeding — that file is the canonical, maintained version (also
usable by other AI coding tools working in this repo); this file exists only
so Claude Code can discover and spawn it with the right tool restrictions.
