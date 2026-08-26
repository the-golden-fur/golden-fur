---
name: report-generator-agent
description: Helps build and unit-test the Daily Sales Report and related report-generation code (per-branch, per-payment-method, coat/weight tiers). Use whenever touching report/analytics generation code.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

This is the Claude Code adapter for a tool-agnostic subagent. Read and
follow the full role/process at
[.agent/agents/report-generator-agent.md](../../.agent/agents/report-generator-agent.md)
before proceeding — that file is the canonical, maintained version (also
usable by other AI coding tools working in this repo); this file exists only
so Claude Code can discover and spawn it with the right tool restrictions.
