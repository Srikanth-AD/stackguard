# Example policies

These are fictional engineering policy documents you can use as a
starting point for your own. They're written to be **specific enough
that stackguard can actually flag prompts against them** — vague
guidelines produce vague checks.

Pick the one closest to your stack, copy it into your repo as
`ENGINEERING_GUIDELINES.md` (or whatever you call it), and edit. Each
file is short enough that adapting it to your real stack is a 30-minute
exercise, not a multi-week project.

| File | Industry | Stack | Distinctive section |
|---|---|---|---|
| [`policy.example.md`](./policy.example.md) | Generic SaaS | Node.js + TypeScript + Postgres + Next.js | Standard structure (good default) |
| [`policy.helio-python.example.md`](./policy.helio-python.example.md) | Data / ML | Python 3.12 + Polars + DuckDB + FastAPI + PyTorch | Reproducibility & Notebook Governance |
| [`policy.forge-go.example.md`](./policy.forge-go.example.md) | Microservices | Go 1.22 + chi + sqlc + slog + OTel | Concurrency & Error Discipline |
| [`policy.ledger-fintech.example.md`](./policy.ledger-fintech.example.md) | Fintech (regulated) | Java 21 + Spring Boot + audit-logged Postgres + Vault | Regulatory Constraints + PII Handling |
| [`policy.minimal.example.md`](./policy.minimal.example.md) | Two-person product team | Whatever's small | Deliberately tiny — no formal sections |

## Picking one

- **You work at a Node.js shop and want a structured template.** Start with `policy.example.md`. It's the most generic and the easiest to adapt.
- **You're a data team.** Start with `policy.helio-python.example.md`. The reproducibility section is the part that matters most and isn't in the others.
- **You're a Go shop.** Start with `policy.forge-go.example.md`. The concurrency rules are Go-specific and worth keeping.
- **You handle money, PII, or anything with a regulatory footprint.** Start with `policy.ledger-fintech.example.md`. The compliance framing and PII section don't appear in the other examples.
- **You're 1–3 people and don't want to read or write a long doc.** Start with `policy.minimal.example.md`. Two paragraphs of "we use X, we don't use Y" is enough for stackguard to enforce.

## Trying one without committing

Every example file is self-contained, so you can point stackguard at it
directly without `init`-ing a project:

```bash
# From the stackguard repo root
stackguard check "add a MongoDB connection" \
  --policy ./examples/policy.example.md

stackguard check "load this CSV with pandas" \
  --policy ./examples/policy.helio-python.example.md

stackguard check "use gin for the HTTP server" \
  --policy ./examples/policy.forge-go.example.md

stackguard check "log the user's email when login fails" \
  --policy ./examples/policy.ledger-fintech.example.md \
  --mode block

stackguard check "use lodash.debounce on the search input" \
  --policy ./examples/policy.minimal.example.md
```

Each example file has a `## Sample stackguard interactions` section at
the bottom showing what the response looks like for prompts the policy
flags and prompts it doesn't.

## What makes these realistic

- **Specific package names.** "Use `@acme/db`, never use `prisma` or
  `drizzle`" is something stackguard can match. "Prefer simple
  abstractions" is not.
- **Explicit reasons in the prose.** When a rule has a sentence
  explaining *why*, the model can quote it back to the developer in
  the violation message. That's much more persuasive than "rule 4.2.1."
- **A mix of prohibitions and approvals.** Prohibitions tell the AI
  what to avoid; approvals tell it what to reach for instead. Both
  matter — without the approval list, the suggested revision is just
  "don't do that."
- **An "AI-Specific Rules" section.** This is the section the checker
  pays the most attention to, because it's framed as instructions to
  an AI assistant. Putting your most-violated rules here is the
  highest-leverage thing you can do to improve precision.

## When *not* to use these as your policy

These are fictional. The libraries, package names, and version
numbers were chosen to make the examples self-contained and
unambiguous, not because they reflect any real company's choices.
Don't ship `@acme/auth` to your team and assume they know what it is.
Adapt the structure, then write your own.
