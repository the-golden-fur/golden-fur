---
name: ci-fixer-agent
description: The write-side counterpart to ci-verifier — takes a red "✅ CI: Verify All" (tests, lint, format, build, across golden-fur and golden-fur-vault) and actually fixes the failures until it's green, without ever weakening a check. Use when ci-verifier or PR CI comes back red.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

This is the Claude Code adapter for a tool-agnostic subagent. Read and
follow the full role/process at
[.agent/agents/ci-fixer-agent.md](../../.agent/agents/ci-fixer-agent.md)
before proceeding — that file is the canonical, maintained version (also
usable by other AI coding tools working in this repo); this file exists only
so Claude Code can discover and spawn it with the right tool restrictions.
