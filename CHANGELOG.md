# Changelog

All notable changes to stackguard are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **`stackguard hook`** — Claude Code `UserPromptSubmit` hook entry point.
  Reads the JSON envelope from stdin (`{prompt, cwd, session_id, ...}`),
  chdirs into the payload's `cwd` so walk-up config discovery finds the
  right `stackguard.json`, runs the check, and exits per the Claude Code
  contract: exit 0 to allow (with optional stdout context), exit 2 to
  block (with stderr containing the user-facing reason).
- **`stackguard install-hook`** — idempotently merges the stackguard hook
  into `.claude/settings.json` (project-local) or `~/.claude/settings.json`
  with `--global`. Preserves all unrelated keys and unrelated hook events.
  `--uninstall` removes the entry and prunes empty groups.
- **`'blocked'`** action type added to `AuditEntry` for hook-mode logging.
- README section *Integrating with Claude Code* explaining the hook flow,
  warn vs block mode behavior in hooks, and a comparison table for when
  to use the hook vs the shell alias.

### Fixed
- **`stackguard wrap` argv parsing.** The previous implementation relied on
  commander's option parser, which mangled pass-through arguments — running
  `stackguard wrap --claude "test"` (no `--` separator) deposited
  `--claude` into `cmd.args[0]` and the wrap code blindly tried to spawn
  it, producing a confusing `ENOENT`. Wrap now bypasses commander entirely
  and parses argv itself via a new `parseWrapArgs` helper. Both
  `wrap claude "x"` and `wrap -- claude "x"` work, and a leading `-` on
  the resolved command now produces a pointed error.

## [0.1.0] — 2026-04-07

### Added
- Biome for linting and formatting (one dependency replaces both
  ESLint and Prettier).
- `node:test` unit suites for the four pure modules (`config`,
  `logger`, `policyLoader`, `checker`) — 27 tests, no API key needed.
- CI runs Biome and the test suite on every push and PR across
  Node 20/22 on Linux and macOS.
- GitHub issue templates for bug reports and feature requests, plus
  a Discussions link for open-ended questions.
- This `CHANGELOG.md`.

### Changed
- `extractJson` and a new `applyLowConfidenceOverride` helper are
  now exported from `checker.ts` so the JSON-extraction and
  low-confidence flip logic can be unit-tested without hitting the
  Anthropic API.
- Marked the package `"private": true` in `package.json` to prevent
  accidental `npm publish` while we soak v0.1.0 with internal users.

## [0.1.0-preview] — 2026-04-07

Initial public preview.

### Added
- `stackguard init` — interactive setup wizard
- `stackguard check <prompt>` — direct prompt checking with
  interactive UI in TTY mode and JSON output in CI mode
- `stackguard wrap -- <command> [args...]` — transparent wrapper
  around AI assistant CLIs (Claude, Cursor, Copilot CLI, etc.)
- `stackguard audit` — view the override log with day/user filters
- `stackguard policy show|hash|source` — inspect the active policy
- Policy document loading from local files or HTTPS URLs with
  on-disk caching for offline resilience
- SHA-256 policy hash integrity check (`policyHash` config field)
  to prevent silent local edits to the policy
- JSONL audit log at `~/.stackguard/audit.jsonl`
- ESLint-style walk-up `stackguard.json` discovery
- Environment variable overrides: `ANTHROPIC_API_KEY`,
  `STACKGUARD_MODE`, `STACKGUARD_POLICY`
- Low-confidence-only violations pass through (see ADR-002) to
  protect adoption from false positives
- Example policy doc and config under `examples/`
- ADRs documenting model choice, low-confidence behavior, and
  log format choices
- GitHub Actions CI on Node 20/22, Linux + macOS

[Unreleased]: https://github.com/Srikanth-AD/stackguard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Srikanth-AD/stackguard/compare/v0.1.0-preview...v0.1.0
[0.1.0-preview]: https://github.com/Srikanth-AD/stackguard/releases/tag/v0.1.0-preview
