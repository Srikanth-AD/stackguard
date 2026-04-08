# Ledger Engineering & Security Standards

**Owner:** Platform Security & Engineering (@platform-sec)
**Version:** 11.0
**Last updated:** 2026-04-01
**Enforcement:** Pre-prompt via `stackguard` (block mode, non-negotiable). Code-review checklist enforced by `@ledger/audit-bot`. Hard violations escalate to the security engineering on-call.
**Compliance scope:** PCI-DSS 4.0, SOC 2 Type II, GDPR, internal audit (Ledger Trust Framework v3).

> **Read this first.** Ledger handles money movement and personally
> identifiable financial data. The rules below are not opinions about
> taste — they are constraints we have committed to in writing to
> regulators and customers. If a rule feels arbitrary, it is because
> the alternative caused a real incident or a real audit finding.
> Override with extreme caution and document why.

---

## 1. Regulatory Constraints (Non-Negotiable)

These come from external commitments. Violating them puts the company's
licenses at risk. **No code path is allowed to bypass them, ever.**

- **All database writes that touch customer financial data MUST go through `@ledger/audit-db`.** This wrapper records actor, intent, and before/after diffs to an immutable audit log. Direct JDBC connections to the financial schemas are blocked at the network layer; using them in code is also a policy violation.
- **NEVER log PII.** This includes (non-exhaustive): full PAN, partial PAN beyond the last 4 digits, full SSN, date of birth, full address, email, phone number, government ID number. Use `@ledger/redact` before any value reaches a logger.
- **NEVER write custom cryptography.** All crypto operations go through `@ledger/crypto`, which wraps Tink. No `javax.crypto` direct usage. No `MessageDigest.getInstance` outside `@ledger/crypto`.
- **NEVER store secrets in code, in environment variables set by humans, or in config files.** Secrets come from HashiCorp Vault via `@ledger/vault`, which rotates them and records access.
- **NEVER deserialize untrusted data with `ObjectInputStream`.** This is RCE. Use Jackson with explicit type binding and a denylist.
- **NEVER bypass `@ledger/egress`** for outbound HTTP. All third-party calls are recorded, rate-limited, and inspected for accidental PII leakage.

---

## 2. PII Handling Rules

PII gets its own section because the rules are specific enough that
the general "don't log secrets" guidance is not enough.

- **At rest:** PII columns are encrypted by `@ledger/audit-db` automatically. You don't need to think about it — but you also can't disable it.
- **In transit:** TLS 1.3 minimum. Internal services use mTLS via the service mesh.
- **In logs:** Forbidden. The `@ledger/logger` redacts any field tagged `@PII` in the model layer. New PII fields require a security review before they're added.
- **In errors:** Exception messages MUST NOT include PII. Catch, redact, then re-raise.
- **In analytics events:** Only hashed or tokenized identifiers leave the production cluster. No raw email or phone in Snowflake.
- **In test fixtures:** Use `@ledger/fixtures` which generates synthetic PII. Real customer data in tests is a P0 incident.

---

## 3. Approved Tech Stack

### Backend
- **Java 21** (LTS) with Spring Boot 3.2+
- **Maven** for builds (NOT Gradle)
- **`@ledger/audit-db`** wrapping Spring Data JPA + PostgreSQL 16
- **`@ledger/messaging`** wrapping Kafka with mandatory schema registry

### Frontend
- **Next.js 14** with strict CSP
- **React Server Components first**, client components only when interactivity is required
- **NEVER store** session tokens, account IDs, or any PII in `localStorage` or `sessionStorage`

### Tooling
- **`spotless`** + **`checkstyle`** + **`error-prone`** + **`@ledger/audit-bot`** in CI
- **`renovate`** for dependency updates with mandatory security review for any CVE-affected bump

---

## 4. AI-Specific Rules

When prompting an AI coding assistant, do NOT ask it to:

- Write SQL or code that bypasses `@ledger/audit-db`
- Log any field that could be PII (email, phone, PAN, SSN, name, address, DOB, IP)
- Implement encryption, decryption, hashing, signing, or key derivation directly
- Read or write secrets from environment variables, files, or hardcoded strings
- Use `ObjectInputStream`, XML external entities, or SnakeYAML's default constructor
- Make outbound HTTP calls outside `@ledger/egress`
- Disable a security check, even temporarily, "for testing"
- Generate test data that resembles real customer information
- Use a third-party auth library (Auth0, Okta, Cognito) directly — `@ledger/auth` is the only entry point

If a task seems to require any of the above, **stop and file a security
review ticket before writing the prompt.** This is faster than
discovering a problem post-merge.

---

## Sample stackguard interactions

Run them yourself with:

```bash
stackguard check "<prompt>" --policy ./policy.ledger-fintech.example.md --mode block
```

Note: this policy is normally run in **block mode** (non-negotiable
compliance rules), so the menu shows `[O]verride with reason` instead
of `[P]roceed anyway`. Overrides are logged with the reason and
reviewed weekly.

### Example 1 — PII in logs (HIGH confidence block)

```
$ stackguard check "log the user's email and account number when their payment fails"

⚠  stackguard: guideline conflict detected
──────────────────────────────────────────────────────────────────────

"log the user's email and account number when their payment fails"
Rule:   NEVER log PII. This includes full PAN, partial PAN beyond
        the last 4 digits, full SSN, date of birth, full address,
        email, phone number, government ID number.
Why:    The prompt explicitly asks to log email and account number,
        both of which are classified PII.
Level:  HIGH confidence

Suggested revision:
┌──────────────────────────────────────────────────────────┐
│ Log a payment failure with the redacted user ID, the   │
│ last 4 of the account, and the failure reason — using  │
│ @ledger/logger so PII fields are automatically masked  │
└──────────────────────────────────────────────────────────┘

[R]evise  [O]verride with reason  [S]how policy  [C]ancel
```

### Example 2 — bypassing audit-db (HIGH confidence block)

```
$ stackguard check "use JdbcTemplate to update the balance column directly"

⚠  stackguard: guideline conflict detected
──────────────────────────────────────────────────────────────────────

"use JdbcTemplate to update the balance column directly"
Rule:   All database writes that touch customer financial data MUST
        go through @ledger/audit-db.
Why:    The prompt asks for direct JDBC writes to a financial column,
        which bypasses the immutable audit log required by SOC 2.
Level:  HIGH confidence

Suggested revision:
┌──────────────────────────────────────────────────────────┐
│ Use the @ledger/audit-db BalanceRepository to record   │
│ the balance change — this writes the audit entry       │
│ automatically                                          │
└──────────────────────────────────────────────────────────┘

[R]evise  [O]verride with reason  [S]how policy  [C]ancel
```

### Example 3 — custom crypto (HIGH confidence block)

```
$ stackguard check "hash this token with SHA-256 using MessageDigest"

⚠  stackguard: guideline conflict detected
──────────────────────────────────────────────────────────────────────

"hash this token with SHA-256 using MessageDigest"
Rule:   NEVER write custom cryptography. All crypto operations go
        through @ledger/crypto, which wraps Tink.
Why:    The prompt asks for direct MessageDigest usage outside the
        approved crypto wrapper.
Level:  HIGH confidence

Suggested revision:
┌──────────────────────────────────────────────────────────┐
│ Hash this token using @ledger/crypto.hash() which      │
│ uses the team's key-managed Tink primitives            │
└──────────────────────────────────────────────────────────┘

[R]evise  [O]verride with reason  [S]how policy  [C]ancel
```

### Example 4 — generic refactor (PASSES)

```
$ stackguard check "extract the receipt formatting logic into its own helper class"
✓ stackguard: ok
```

Refactoring within an existing module is unrelated to any compliance
constraint. Stackguard stays out of the way.
