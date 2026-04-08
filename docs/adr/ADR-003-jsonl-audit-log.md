# ADR-003: JSONL for the Audit Log

## Context

stackguard logs every override and revision so engineering managers
can review patterns ("which rules are being bypassed most?"). This
log needs to be durable, parseable, and free of operational overhead.

## Decision

Store audit entries as newline-delimited JSON (JSONL) at
`~/.stackguard/audit.jsonl` by default. Each line is a complete,
self-contained JSON object.

## Rationale

- **Zero infrastructure.** No database to provision, no service to
  run, no schema migrations. The tool installs and works.
- **Append-only survives crashes.** A partial write at most loses
  the trailing line. Existing entries are never corrupted.
- **Trivially parseable.** `jq`, `grep`, `awk`, or any text tool
  works. The `stackguard audit` command is just a convenience —
  the data is fully accessible without it.
- **Local-first.** Each developer's log lives on their machine.
  Sharing is opt-in (e.g., upload to S3 via cron, or commit to a
  team repo). No central collector, no privacy concerns by default.

## Consequences

- No cross-developer aggregation out of the box. Teams that want
  org-wide reporting must build a collector — typically a nightly
  rsync or a CI step that uploads to S3.
- The file grows unbounded. Very heavy users may want to rotate it
  manually or via logrotate. We've intentionally not added rotation
  to the tool to keep it dependency-free.
- Schema evolution is handled by additive fields only. Older
  parsers must tolerate unknown keys.
