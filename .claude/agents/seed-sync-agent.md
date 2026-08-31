---
name: seed-sync-agent
description: Keeps supabase/seeds/ in step with the schema — updates the idempotent .ts + mirrored .sql + .spec.ts seed trio whenever a migration adds a table or changes a column/enum/constraint on a table that has seed coverage. Use after writing a schema change, before pushing migrations.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

This is the Claude Code adapter for a tool-agnostic subagent. Read and
follow the full role/process at
[.agent/agents/seed-sync-agent.md](../../.agent/agents/seed-sync-agent.md)
before proceeding — that file is the canonical, maintained version (also
usable by other AI coding tools working in this repo); this file exists only
so Claude Code can discover and spawn it with the right tool restrictions.
