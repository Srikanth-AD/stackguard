# stackguard

> Pre-prompt policy enforcement for AI coding assistants.

[![npm version](https://img.shields.io/badge/npm-v0.1.0-blue.svg)]()
[![license](https://img.shields.io/badge/license-MIT-green.svg)]()
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)]()

---

## The problem

Your team agreed last quarter that all new auth flows go through
`@acme/auth`. Then a developer opens Cursor and types
*"implement JWT auth from scratch with refresh tokens"*. The AI
happily produces 200 lines of custom token signing code. By the time
code review catches it three days later, the developer has shipped
two more features on top and is deep in a different branch.

Same story for *"add a MongoDB connection"* when the policy is
PostgreSQL-only, or *"use lodash to dedupe this array"* when lodash
was banned eighteen months ago. The rules exist. The AI doesn't know
them. The developer forgot — or never read the doc in the first place.

stackguard catches the violation **before** the prompt reaches the AI.
It compares each prompt to your engineering policy doc, flags
explicit conflicts, and offers a compliant rewrite — all in about 1.5
seconds, with no infrastructure to set up.

---

## How it works

```
                ┌────────────────────────┐
   Developer ──▶│   "add MongoDB conn"   │
                └──────────┬─────────────┘
                           ▼
                ┌────────────────────────┐
                │      stackguard        │
                │  + policy.md + Haiku   │
                └──────────┬─────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        ✓ no conflict             ⚠ conflict
              │                         │
              │              ┌──────────┴──────────┐
              │              │ [P]roceed [R]evise  │
              │              │ [S]how    [C]ancel  │
              │              └──────────┬──────────┘
              ▼                         ▼
       ┌─────────────┐          ┌────────────────┐
       │ Claude/Cursor│         │  revised prompt │
       │  /Copilot    │◀────────│  or override    │
       └─────────────┘          └────────────────┘
```

---

## Quickstart

```bash
npm install -g stackguard
cd your-project
stackguard init
export ANTHROPIC_API_KEY=sk-ant-...

# Direct check
stackguard check "implement JWT auth from scratch"

# Wrap your AI assistant
stackguard wrap -- claude "add MongoDB connection"

# Set it as your default
alias claude='stackguard wrap -- claude'
```

---

## What it checks vs. what it doesn't

**It checks:**
- Explicit prohibited libraries ("use lodash", "add axios")
- Explicit prohibited tech ("add MongoDB", "use Auth0")
- Explicit prohibited patterns ("implement JWT from scratch")

**It does not check:**
- Vague prompts ("build a login page") — there's nothing to flag yet
- Code quality, formatting, or naming — that's your linter's job
- Code the AI actually generates — that's code review's job

stackguard is a **first line of defense at the prompt layer**. It
complements, not replaces, linters, CI checks, and code review.

---

## Team rollout guide (for engineering managers)

1. **Write your policy.** Start from `examples/policy.example.md`.
   The more explicit ("NEVER use MongoDB"), the better stackguard
   performs. Vague guidelines produce vague checks.

2. **Lock the policy hash.** Run `stackguard policy hash` and paste
   the output into `stackguard.json` as `policyHash`. This prevents
   developers from silently editing the policy to bypass rules.

3. **Add to onboarding.** New developers should run `stackguard init`
   on day one. Set `ANTHROPIC_API_KEY` in their shell profile.

4. **Make it the default.** Have developers add a shell alias:
   `alias claude='stackguard wrap -- claude'`. Now every prompt is
   checked by default. Opting out is explicit, not accidental.

5. **Review the audit log weekly.** `stackguard audit --days 7`
   shows what was overridden and why. Patterns ("everyone is
   overriding the lodash rule") tell you whether the policy needs
   updating or whether the rule needs to be more strongly enforced.

---

## Policy document integrity

Without `policyHash`, a developer could edit `ENGINEERING_GUIDELINES.md`
locally, delete the rule they don't like, and stackguard would
silently accept the modified policy. With `policyHash` set, any
modification produces a hash mismatch and stackguard refuses to run
until the team's official hash is updated.

This makes policy updates a deliberate, reviewable act:
1. Engineering manager edits the policy
2. Runs `stackguard policy hash`
3. Updates `policyHash` in `stackguard.json`
4. Both changes go through PR review together

---

## Comparison

|                           | stackguard | CodeGate     | Tabnine Enterprise | CLAUDE.md         |
|---------------------------|:----------:|:------------:|:------------------:|:-----------------:|
| Open source               | ✅         | ✅           | ❌                 | ✅                |
| Pre-prompt                | ✅         | ✅           | ❌                 | ✅                |
| Enforced                  | ✅         | ✅           | ✅                 | ❌                |
| Zero setup                | ✅         | ❌ Docker    | ❌                 | ✅                |
| Tech stack rules          | ✅         | ❌           | ✅                 | advisory only     |
| Audit log                 | ✅         | ❌           | ❌                 | ❌                |

---

## Privacy

- Prompts are sent to the **Anthropic API**, the same place your AI
  assistant already sends them. stackguard adds no new third party.
- Your **policy document stays local** (or on a URL you control).
- There are **no stackguard servers**. The tool is a CLI; the only
  network call it makes is to the Anthropic API.
- The **audit log is local** at `~/.stackguard/audit.jsonl`. Sharing
  it with your team is opt-in.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). PRs welcome — please open
an issue first for non-trivial changes.

## License

MIT
