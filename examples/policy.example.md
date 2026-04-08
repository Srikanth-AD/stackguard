# Acme Engineering Guidelines

**Owner:** Platform Engineering Team (@platform-eng)
**Version:** 2.4
**Last updated:** 2026-03-15
**Enforcement:** These guidelines are enforced via `stackguard` at the
prompt layer and via CI checks at the PR layer. Violations require
explicit override with a documented reason.

---

## 1. Approved Tech Stack

### Backend
- **Runtime:** Node.js 20+ (LTS only)
- **Language:** TypeScript 5.x with `strict: true`
- **Framework:** Fastify 4.x (NOT Express, NOT Koa, NOT Hapi)
- **Validation:** Zod (NOT Joi, NOT Yup, NOT class-validator)
- **HTTP client:** Native `fetch` (NOT axios, NOT got, NOT node-fetch)

### Database
- **Primary database:** PostgreSQL 15+ via `@acme/db` (our internal
  query builder wrapping `pg`).
- **NEVER use** raw `pg` clients directly — `@acme/db` enforces query
  timeouts, connection pooling limits, and tenant isolation.
- **NEVER use** Prisma, TypeORM, Sequelize, Knex, MikroORM, or Drizzle.
  We standardized on `@acme/db` to maintain a single migration story.
- **NEVER use** MongoDB, DynamoDB, or any NoSQL store for primary data.
  Cache layer is Redis via `@acme/cache` only.

### Frontend
- **Framework:** Next.js 14 App Router (NOT Pages Router)
- **State:** React Server Components first; client state via Zustand
- **NEVER use** Redux, MobX, Recoil, or Jotai
- **Styling:** Tailwind CSS via our preset `@acme/tailwind-preset`
- **NEVER use** styled-components, emotion, or CSS-in-JS at runtime

### Authentication
- **All auth flows** must go through `@acme/auth` (our SSO wrapper).
- **NEVER use** Auth0, Clerk, NextAuth, Firebase Auth, Supabase Auth,
  Passport.js, or any third-party auth provider directly.
- **NEVER implement JWT signing, verification, or refresh logic from
  scratch.** `@acme/auth` handles token lifecycle.
- **NEVER store** session tokens in `localStorage` — use httpOnly
  cookies set by `@acme/auth`.

---

## 2. Prohibited Libraries

| Prohibited | Use instead |
|---|---|
| `lodash`, `lodash-es` | Native JS (`Array.prototype.*`, `Object.entries`) |
| `moment`, `moment-timezone` | `date-fns` or native `Intl.DateTimeFormat` |
| `request`, `axios`, `got` | Native `fetch` |
| `bcrypt`, `bcryptjs` | `@acme/auth` (handles password hashing) |
| `jsonwebtoken` | `@acme/auth` |
| `dotenv` | `@acme/config` (validates env at boot) |
| `uuid` | `crypto.randomUUID()` (Node 20+) |
| `chalk` (in product code) | Plain strings; chalk is dev-only |

---

## 3. Code Patterns to Avoid

- **NEVER use** `any` in TypeScript. Use `unknown` and narrow.
- **NEVER use** `process.env.X` directly outside `@acme/config`.
- **NEVER write** raw SQL strings concatenated with user input.
  Use `@acme/db` parameterized queries.
- **NEVER catch** errors silently. All `catch` blocks must either
  re-throw or log via `@acme/logger`.
- **NEVER use** `console.log` in product code. Use `@acme/logger`.
- **NEVER write** custom rate limiting, custom CSRF protection, or
  custom session management. These live in `@acme/auth` middleware.

---

## 4. AI-Specific Rules

When prompting an AI coding assistant, do NOT ask it to:

- Implement JWT authentication, signing, or verification from scratch
- Add MongoDB, DynamoDB, or any NoSQL database
- Install or use lodash, axios, moment, bcrypt, or jsonwebtoken
- Use Express, Koa, or Hapi
- Use Prisma, TypeORM, Drizzle, or any ORM other than `@acme/db`
- Use Auth0, Clerk, NextAuth, or any third-party auth provider
- Set up Redux, MobX, or other Flux-style state management
- Write CSS-in-JS at runtime (styled-components, emotion)
- Hash passwords manually with bcrypt or argon2
- Generate UUIDs with the `uuid` package
- Bypass `@acme/db`, `@acme/auth`, `@acme/config`, or `@acme/logger`

When in doubt, ask the AI to use the approved stack above.
If you genuinely need an exception, file an RFC with @platform-eng
before writing the prompt.

---

## Sample stackguard interactions

Run them yourself with:

```bash
stackguard check "<prompt>" --policy ./policy.example.md
```

### Example 1 — explicit prohibited tech (HIGH confidence block)

```
$ stackguard check "add a MongoDB connection for user sessions"

⚠  stackguard: guideline conflict detected
──────────────────────────────────────────────────────────────────────

"add a MongoDB connection for user sessions"
Rule:   NEVER use MongoDB, DynamoDB, or any NoSQL store for primary
        data.
Why:    The prompt explicitly names MongoDB; Acme uses PostgreSQL
        via @acme/db.
Level:  HIGH confidence

Suggested revision:
┌──────────────────────────────────────────────────────────┐
│ Add a Postgres-backed user_sessions table accessed via │
│ @acme/db, with a parameterized query for lookups       │
└──────────────────────────────────────────────────────────┘

[P]roceed anyway  [R]evise  [S]how policy  [C]ancel
```

### Example 2 — custom security primitive (HIGH confidence block)

```
$ stackguard check "implement JWT auth from scratch with refresh tokens"

⚠  stackguard: guideline conflict detected
──────────────────────────────────────────────────────────────────────

"implement JWT auth from scratch with refresh tokens"
Rule:   NEVER implement JWT signing, verification, or refresh logic
        from scratch. @acme/auth handles token lifecycle.
Why:    The prompt asks for custom token logic, which the policy
        delegates to the shared auth wrapper.
Level:  HIGH confidence

Suggested revision:
┌──────────────────────────────────────────────────────────┐
│ Add login and session handling using @acme/auth, which │
│ manages token issuance and refresh                     │
└──────────────────────────────────────────────────────────┘

[P]roceed anyway  [R]evise  [S]how policy  [C]ancel
```

### Example 3 — vague prompt (PASSES)

```
$ stackguard check "build a settings page where users can change their display name"
✓ stackguard: ok
```

The prompt doesn't name a banned library or pattern. The AI may
use approved tools in its response — that's fine.

### Example 4 — soft warning (LOW confidence, passes through)

```
$ stackguard check "add a date picker that handles timezones nicely"
ℹ  stackguard: possible conflict (low confidence — passing through)
"date picker that handles timezones" may conflict with "moment is prohibited…"
```

The model thinks this *might* drift toward `moment-timezone` but
isn't sure. Per ADR-002, low-confidence violations don't interrupt
the developer.
