# Tworow Engineering Notes

**Owner:** Both of us (@sam, @priya)
**Updated when we change our minds**

We're a two-person product team. We don't have an EM, we don't have a
platform team, and we don't want to read a 12-page policy document.
This is what we've agreed on. If you're a future hire, ask one of us
before adding anything that contradicts this.

---

We use **TypeScript on Node 20+**, **SQLite via better-sqlite3**, and
**Hono** for HTTP. We have rejected Express, Fastify, Next.js, Prisma,
and Drizzle. We're not against any of them in principle — we just
don't want two ways to do the same thing in a 4,000-line codebase.

We use **stdlib `fetch`** for outbound HTTP. We don't use axios,
got, ky, or any other client. If you're tempted to add one, the
answer is "use fetch."

We don't use **lodash, dayjs, moment, uuid, or any utility library**
that ships more than ~5 KB. We will write the three lines we need.

We don't write **custom auth, custom crypto, or custom rate limiting**.
For auth we use **Lucia**. For crypto we use stdlib `node:crypto`. For
rate limiting we use the proxy in front of us.

We don't add a **dependency we can't read in an afternoon.** Every
new dep is a 5-minute conversation in Slack first. The bar is "this
saves us a week." If it saves us a day, we write it ourselves.

We don't write **tests for trivial code**, and we don't skip tests
for code that touches money or auth. Use judgment.

We don't use **AI to generate code we don't understand**. The AI is
for typing speed, not for thinking. If you can't explain what the
generated code does, delete it.

That's the whole policy.

---

## Sample stackguard interactions

Run them yourself with:

```bash
stackguard check "<prompt>" --policy ./policy.minimal.example.md
```

### Example 1 — explicit prohibited library (HIGH confidence block)

```
$ stackguard check "use lodash.debounce to throttle the search input"

⚠  stackguard: guideline conflict detected
──────────────────────────────────────────────────────────────────────

"use lodash.debounce to throttle the search input"
Rule:   We don't use lodash, dayjs, moment, uuid, or any utility
        library that ships more than ~5 KB. We will write the three
        lines we need.
Why:    The prompt names lodash, which is on the explicit no-list.
Level:  HIGH confidence

Suggested revision:
┌──────────────────────────────────────────────────────────┐
│ Add a small inline debounce helper (3-4 lines) for the │
│ search input                                            │
└──────────────────────────────────────────────────────────┘

[P]roceed anyway  [R]evise  [S]how policy  [C]ancel
```

### Example 2 — wrong framework (HIGH confidence block)

```
$ stackguard check "scaffold a Next.js page that fetches data on the server"

⚠  stackguard: guideline conflict detected
──────────────────────────────────────────────────────────────────────

"scaffold a Next.js page that fetches data on the server"
Rule:   We have rejected Express, Fastify, Next.js, Prisma, and
        Drizzle. We're not against any of them in principle — we
        just don't want two ways to do the same thing.
Why:    The prompt asks for a Next.js page; this team uses Hono,
        not Next.js.
Level:  HIGH confidence

Suggested revision:
┌──────────────────────────────────────────────────────────┐
│ Add a Hono route that fetches the data and returns it │
│ as JSON                                                 │
└──────────────────────────────────────────────────────────┘

[P]roceed anyway  [R]evise  [S]how policy  [C]ancel
```

### Example 3 — generic, passes

```
$ stackguard check "write a function that returns the current ISO8601 timestamp in UTC"
✓ stackguard: ok
```

The prompt doesn't name a banned thing, so it's fine. The AI may
choose to use `new Date().toISOString()` or import dayjs in its
response — if it picks dayjs, that gets caught at code review (or
on the *next* prompt that mentions it).

### What this example proves

A useful policy doesn't need formal sections, version numbers, or
compliance language. Two paragraphs of "we use X, we don't use Y, ask
before adding anything new" is enough for stackguard to enforce. Most
solo and small-team policies should look more like this and less like
the multi-section corporate examples.
