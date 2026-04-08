# ADR-001: Use Claude Haiku for Policy Checking

## Context

stackguard sits in the developer's hot path: every prompt to an AI
assistant goes through it. The check itself is a classification task —
"does this prompt name a prohibited technology?" — not generation.
Latency and cost directly determine whether developers tolerate the
tool or quietly remove it.

## Decision

Use `claude-haiku-4-5-20251001` as the default model for all policy
checks. Allow override via `model` in `stackguard.json`.

## Rationale

- **Cost:** ~$0.001 per check. A team of 50 doing 100 prompts/day
  costs ~$5/day. Larger models are 10x that.
- **Latency:** ~1.5s round-trip. Larger models add 3–4s, which is
  the threshold where developers context-switch and disengage.
- **Accuracy:** Haiku is more than capable of pattern-matching
  prohibited library names against a policy doc. It is NOT being
  asked to reason about subtle architectural tradeoffs.
- **Adoption math:** A tool that's 95% accurate but always-on beats
  a tool that's 99% accurate but slow enough to be uninstalled.

## Consequences

- Some false negatives are expected (subtle violations slip through).
  This is acceptable: stackguard is a first line, not the only line.
  CI checks and code review remain.
- Teams that need stricter checking can override `model` in their
  config to use a more capable model at the cost of latency.
- Low-confidence violations are passed through (see ADR-002) to
  further reduce false-positive friction.
