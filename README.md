# stackguard

> Pre-prompt policy enforcement for AI coding assistants.

[![CI](https://github.com/Srikanth-AD/stackguard/actions/workflows/ci.yml/badge.svg)](https://github.com/Srikanth-AD/stackguard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![Biome](https://img.shields.io/badge/lint-biome-60a5fa.svg)](https://biomejs.dev/)

---

## The problem

Your team agreed last quarter that all new auth flows go through
your shared auth wrapper. Then a developer opens their AI assistant
and asks it to *"implement token signing and refresh from scratch."*
The AI happily produces 200 lines of custom security code. By the
time code review catches it three days later, the developer has
shipped two more features on top and is deep in a different branch.

Same story when a prompt asks for a database driver that isn't on
the approved list, or pulls in a utility library the team migrated
off of last year. The rules exist. The AI doesn't know them. The
developer forgot — or never read the doc in the first place.

stackguard catches the violation **before** the prompt reaches the AI.
It compares each prompt to your engineering policy doc, flags
explicit conflicts, and offers a compliant rewrite — all in about 1.5
seconds, with no infrastructure to set up.

---

## How it works

```
                ┌────────────────────────┐
   Developer ──▶│   "add a DB connection"│
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
stackguard check "implement token signing from scratch"

# Wrap your AI assistant
stackguard wrap -- claude "add a database connection"

# Set it as your default
alias claude='stackguard wrap -- claude'
```

---

## What it checks vs. what it doesn't

**It checks:**
- Prompts that name a library your policy excludes
- Prompts that name a database, framework, or service outside
  your approved stack
- Prompts that ask for security primitives your team has agreed
  to delegate to a shared wrapper

**It does not check:**
- Vague prompts ("build a login page") — there's nothing to flag yet
- Code quality, formatting, or naming — that's your linter's job
- Code the AI actually generates — that's code review's job

stackguard is a **first line of defense at the prompt layer**. It
complements, not replaces, linters, CI checks, and code review.

---

## Team rollout guide

1. **Write your policy.** Start from `examples/policy.example.md`.
   The more explicit your rules are, the better stackguard performs.
   Vague guidelines produce vague checks.

2. **Lock the policy hash.** Run `stackguard policy hash` and paste
   the output into `stackguard.json` as `policyHash`. This prevents
   developers from silently editing the policy to bypass rules.

3. **Add to onboarding.** New developers should run `stackguard init`
   on day one. Set `ANTHROPIC_API_KEY` in their shell profile.

4. **Make it the default.** Have developers add a shell alias:
   `alias claude='stackguard wrap -- claude'`. Now every prompt is
   checked by default. Opting out is explicit, not accidental.

5. **Review the audit log weekly.** `stackguard audit --days 7`
   shows what was overridden and why. Patterns — the same rule
   getting overridden by everyone — tell you whether the policy
   needs updating or whether the rule needs to be enforced harder.

---

## Policy document integrity

Without `policyHash`, a developer could edit `ENGINEERING_GUIDELINES.md`
locally, delete the rule they don't like, and stackguard would
silently accept the modified policy. With `policyHash` set, any
modification produces a hash mismatch and stackguard refuses to run
until the team's official hash is updated.

This makes policy updates a deliberate, reviewable act:
1. SME or engineering lead edits the policy
2. Runs `stackguard policy hash`
3. Updates `policyHash` in `stackguard.json`
4. Both changes go through PR review together

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
