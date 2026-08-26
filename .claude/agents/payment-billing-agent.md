---
name: payment-billing-agent
description: Implements and tests PayMongo (GCash/Maya) webhook handling, manual reconciliation, and the Credit Balance ledger against sandbox data. Use whenever touching payment, webhook, or credit-ledger code — never operates on live transactions.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

This is the Claude Code adapter for a tool-agnostic subagent. Read and
follow the full role/process at
[.agent/agents/payment-billing-agent.md](../../.agent/agents/payment-billing-agent.md)
before proceeding — that file is the canonical, maintained version (also
usable by other AI coding tools working in this repo); this file exists only
so Claude Code can discover and spawn it with the right tool restrictions.

Sandbox only: never use, request, or hardcode live PayMongo keys.
