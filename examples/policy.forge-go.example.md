# Forge Systems Engineering Guidelines

**Owner:** Platform Engineering (@platform)
**Version:** 7.2
**Last updated:** 2026-02-14
**Enforcement:** Pre-prompt via `stackguard`, plus `golangci-lint` + a custom `forge-lint` analyzer in CI. Hard violations require an architecture review.

---

## 1. Approved Tech Stack

### Language and runtime
- **Go 1.22+** (we depend on `slog`, `range over int`, and `for-range` loop variable scoping)
- **Modules pinned to exact versions.** No `^` or wildcard ranges in go.mod.

### HTTP services
- **Standard library `net/http`** with the `chi` router for routing only
- **NOT** gin, echo, fiber, gorilla/mux, or any other framework
- **NOT** gRPC for new services (existing gRPC services stay; new work is REST + protobuf payloads)

### Persistence
- **Postgres 16** via **`sqlc`-generated** typed queries
- **NEVER use** `database/sql` directly outside `sqlc` output
- **NEVER use** an ORM. We have specifically rejected GORM, ent, bun, and xorm.

### Logging, metrics, tracing
- **`log/slog`** (stdlib) — NOT logrus, NOT zap, NOT zerolog
- **OpenTelemetry SDK** for traces and metrics
- **`prometheus/client_golang`** for metric exposition
- All three are wired through `forge/observability`. Use that, not the libs directly.

### Internal packages
- `forge/auth` — request authentication and authorization
- `forge/config` — typed config from env via `envconfig`-style struct tags
- `forge/observability` — logger, tracer, meter
- `forge/db` — sqlc helpers, migrations, connection pooling

---

## 2. Prohibited Libraries

| Prohibited | Use instead |
|---|---|
| `gin`, `echo`, `fiber`, `gorilla/mux` | `net/http` + `chi` router |
| `gorm`, `ent`, `bun`, `xorm`, `sqlx` | `sqlc` |
| `logrus`, `zap`, `zerolog`, `glog` | `log/slog` |
| `viper`, `koanf` | `forge/config` |
| `errors/pkg` | stdlib `errors` (1.20+ has wrapping) |
| `uuid`-the-package | `crypto/rand` (we generate ULIDs in `forge/ids`) |
| any third-party HTTP client | stdlib `net/http.Client` with our `forge/httpclient` wrapper |

---

## 3. Concurrency & Error Discipline

(Unique to Forge — Go gives you enough rope to hang yourself with goroutines. These rules exist because we have spent real on-call hours debugging the mistakes they prevent.)

### Goroutines
- **Every `go` statement must have an obvious lifetime owner.** Either it's tied to a `context.Context` that someone will cancel, or it's tied to a `sync.WaitGroup` someone will `Wait()` on. Fire-and-forget goroutines are banned. We have an analyzer that fails CI on bare `go func()` outside `main`.
- **No goroutines inside HTTP handlers** unless explicitly cancelled by the request context. Background work belongs in a worker pool, not in a handler.
- **`errgroup.Group` is the default** for fan-out; raw goroutines + channels require a justification in the PR description.

### Context
- **`context.Context` is the FIRST argument** of any function that does I/O, makes a network call, or runs longer than a microsecond. No exceptions.
- **NEVER store a context in a struct.** Pass it explicitly.
- **NEVER use `context.Background()` outside `main` and tests.** Use the context you were handed.

### Errors
- **Wrap with `%w`, never with `%v`** when you want the chain preserved. `forge-lint` enforces this.
- **NEVER use `panic` in library code.** Panics are for "this state is impossible" — they belong in `main` or in test setup, not in production paths.
- **Sentinel errors must be exported** so callers can `errors.Is` them. Don't compare error strings.

### Globals and init
- **`init()` is banned** outside generated code (sqlc, protoc). Side effects at import time are how we get unexplained 90-second test startup times.
- **No package-level mutable state.** Configuration is injected explicitly via constructors. The compiler can't help you debug mutable globals.

---

## 4. AI-Specific Rules

When prompting an AI coding assistant, do NOT ask it to:

- Use gin, echo, fiber, or any router/framework other than chi
- Use GORM, ent, bun, or any ORM
- Use logrus, zap, or zerolog
- Spawn a goroutine without a clear lifetime owner
- Write `init()` functions
- Use `panic` in library code
- Add a third-party HTTP client (axios-equivalents like resty are banned)
- Bypass `forge/observability`, `forge/config`, `forge/auth`, or `forge/db`
- Use `context.Background()` outside `main`

---

## Sample stackguard interactions

Run them yourself with:

```bash
stackguard check "<prompt>" --policy ./policy.forge-go.example.md
```

### Example 1 — explicit framework reference (HIGH confidence block)

```
$ stackguard check "set up a gin server with a /healthz endpoint"

⚠  stackguard: guideline conflict detected
──────────────────────────────────────────────────────────────────────

"set up a gin server with a /healthz endpoint"
Rule:   gin is prohibited; use net/http + chi router
Why:    The prompt explicitly names gin, which is on the prohibited
        list. Forge uses stdlib net/http with chi for routing.
Level:  HIGH confidence

Suggested revision:
┌──────────────────────────────────────────────────────────┐
│ Set up a net/http server with a chi router and a       │
│ /healthz endpoint                                       │
└──────────────────────────────────────────────────────────┘

[P]roceed anyway  [R]evise  [S]how policy  [C]ancel
```

### Example 2 — concurrency discipline (MEDIUM confidence)

```
$ stackguard check "fire off a background goroutine to email the user after the response"

⚠  stackguard: guideline conflict detected
──────────────────────────────────────────────────────────────────────

"fire off a background goroutine to email the user after the response"
Rule:   No goroutines inside HTTP handlers unless explicitly cancelled
        by the request context. Background work belongs in a worker
        pool, not in a handler.
Why:    The prompt asks for a fire-and-forget goroutine in a request
        handler, which Forge bans because of past production incidents.
Level:  MEDIUM confidence

Suggested revision:
┌──────────────────────────────────────────────────────────┐
│ Enqueue an email job onto the worker pool after the    │
│ response so it runs outside the request lifetime        │
└──────────────────────────────────────────────────────────┘

[P]roceed anyway  [R]evise  [S]how policy  [C]ancel
```

### Example 3 — vague prompt (PASSES)

```
$ stackguard check "add a function that parses an ISO8601 timestamp into time.Time"
✓ stackguard: ok
```

The prompt doesn't name a banned library or pattern. The `time` package
is stdlib and unrestricted.

### Example 4 — ORM mention (HIGH confidence block)

```
$ stackguard check "add a User model with GORM and a hasMany relation to Posts"

⚠  stackguard: guideline conflict detected
──────────────────────────────────────────────────────────────────────

"add a User model with GORM and a hasMany relation to Posts"
Rule:   NEVER use an ORM. We have specifically rejected GORM, ent,
        bun, and xorm.
Why:    The prompt names GORM directly. Forge uses sqlc-generated
        typed queries instead of an ORM abstraction.
Level:  HIGH confidence

Suggested revision:
┌──────────────────────────────────────────────────────────┐
│ Add a users table migration and write a sqlc query     │
│ that joins users to posts                               │
└──────────────────────────────────────────────────────────┘

[P]roceed anyway  [R]evise  [S]how policy  [C]ancel
```
