# Contributing to stackguard

Thanks for considering a contribution! stackguard is intentionally
small and dependency-light. We'd like to keep it that way.

## Running locally

```bash
git clone https://github.com/your-org/stackguard.git
cd stackguard
npm install
npm run dev          # tsup watch mode
```

In another terminal:

```bash
node dist/index.js --help
node dist/index.js init
node dist/index.js check "implement JWT auth from scratch"
```

## Manual testing

The most important paths to exercise before opening a PR:

1. **`stackguard check` interactive mode** — both warn and block.
   Try high, medium, and low confidence violations.
2. **`stackguard check --json`** — output should be valid JSON,
   exit code should be 0 (passed) or 1 (violations).
3. **`stackguard check` in a non-TTY** (`stackguard check "..." | cat`)
   — should never block on input, must exit non-zero in block mode.
4. **`stackguard wrap -- echo hello`** — should pass through and
   echo "hello".
5. **`stackguard wrap -- claude "add MongoDB"`** — full flow including
   revising the prompt and re-running the wrapped command.
6. **`stackguard policy hash`** then setting `policyHash` in
   `stackguard.json` — verify hash mismatch detection.

You'll need an `ANTHROPIC_API_KEY` for any check that hits the API.

## PR guidelines

- **One thing per PR.** A bug fix and a refactor in the same PR is
  two PRs. Small PRs get reviewed faster.
- **Tests for new behavior.** If you add a new code path, add
  coverage. We don't have a heavy test framework — manual reproducible
  steps in the PR description count if the code path is small.
- **Update the README** if you change user-facing behavior.
- **Don't add dependencies** without discussion. The current
  dependency list is intentionally short. Each new dep is a supply
  chain risk and an install-time cost.

## Issue templates

### Bug report
- What command did you run?
- What did you expect?
- What happened instead?
- `stackguard --version`, Node version, OS
- Relevant snippet from `~/.stackguard/debug.log` if any

### Feature request
- What problem are you trying to solve?
- What's your current workaround?
- Have you considered fitting it into an existing command instead
  of adding a new one?

## Architecture Decision Records

Any change that touches the model selection, the check protocol,
the audit log format, or the interactive UI flow **requires an ADR**
in `docs/adr/`. Existing ADRs are short (<200 words) — match that
style. The point is to capture *why*, not *what*: the diff already
shows the what.

## License

By contributing, you agree your contributions are licensed under
the MIT License.
