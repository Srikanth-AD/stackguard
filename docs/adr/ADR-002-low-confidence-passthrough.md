# ADR-002: Low-Confidence Violations Pass Through

## Context

When the checker flags a violation, it also rates its confidence
(high/medium/low). Low-confidence violations are typically ambiguous —
the prompt mentions something that *could* be a prohibited approach
but might not be. Treating these the same as high-confidence
violations would interrupt the developer for false positives.

## Decision

If a check returns violations but ALL of them are low confidence,
override `passed` to `true` and surface them as an informational
note instead of an interactive blocking UI.

## Rationale

- **False positives are worse than false negatives** for adoption.
  A developer who is blocked unfairly once will tolerate it. Twice,
  they grumble. Three times, the tool gets uninstalled or aliased
  out of existence.
- **Low confidence = ambiguous = not worth blocking for.** The model
  itself is signaling uncertainty. Acting decisively on uncertain
  signals erodes trust in the tool.
- **High and medium confidence violations are explicit** — the
  prompt names a specific prohibited library, framework, or
  pattern by name — and worth interrupting for.

## Consequences

- Some real violations will slip through when the model is uncertain.
  The audit log still records them as informational, so an EM
  reviewing the log can spot patterns.
- The interactive UI only triggers when there's genuine signal,
  preserving the "this tool respects my time" relationship that
  drives long-term adoption.
- Teams that want stricter behavior can fork or send a PR adding a
  `strictMode` config option. We've intentionally not added that
  flag yet to keep the default behavior coherent.
