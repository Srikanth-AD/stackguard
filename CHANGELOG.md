# Changelog

All notable changes to stackguard are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Biome for linting and formatting (replaces a future need for
  ESLint + Prettier with a single dependency).
- `node:test` unit suites for the four pure modules (`config`,
  `logger`, `policyLoader`, `checker`) — 27 tests, no API key needed.
- CI now runs Biome and the test suite on every push and PR.
- GitHub issue templates for bug reports and feature requests.
- This `CHANGELOG.md`.

### Changed
- `extractJson` and a new `applyLowConfidenceOverride` helper are
  now exported from `checker.ts` so the JSON-extraction and
  low-confidence flip logic can be unit-tested without hitting the
  Anthropic API.

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

[Unreleased]: https://github.com/Srikanth-AD/stackguard/compare/v0.1.0-preview...HEAD
[0.1.0-preview]: https://github.com/Srikanth-AD/stackguard/releases/tag/v0.1.0-preview
