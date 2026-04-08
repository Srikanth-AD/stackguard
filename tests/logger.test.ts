import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import { logEntry, readEntries } from '../src/lib/logger.ts'
import type { AuditEntry } from '../src/types.ts'

let tmpDir: string

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-logger-'))
})

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    prompt: 'test prompt',
    violations: [],
    action: 'passed',
    user: 'tester',
    cwd: '/tmp',
    ...overrides,
  }
}

describe('logger', () => {
  test('readEntries returns [] for missing file', async () => {
    const entries = await readEntries(path.join(tmpDir, 'nonexistent.jsonl'))
    assert.deepEqual(entries, [])
  })

  test('logEntry + readEntries round-trip', async () => {
    const logPath = path.join(tmpDir, 'audit.jsonl')
    await logEntry(makeEntry({ prompt: 'one' }), logPath)
    await logEntry(makeEntry({ prompt: 'two' }), logPath)
    const entries = await readEntries(logPath)
    assert.equal(entries.length, 2)
    assert.equal(entries[0].prompt, 'one')
    assert.equal(entries[1].prompt, 'two')
  })

  test('readEntries skips malformed lines', async () => {
    const logPath = path.join(tmpDir, 'mixed.jsonl')
    await fs.writeFile(
      logPath,
      `${JSON.stringify(makeEntry({ prompt: 'good' }))}\nnot-json\n${JSON.stringify(makeEntry({ prompt: 'also-good' }))}\n`,
      'utf-8'
    )
    const entries = await readEntries(logPath)
    assert.equal(entries.length, 2)
    assert.equal(entries[0].prompt, 'good')
    assert.equal(entries[1].prompt, 'also-good')
  })

  test('days filter excludes old entries', async () => {
    const logPath = path.join(tmpDir, 'days.jsonl')
    const now = Date.now()
    const old = new Date(now - 30 * 86400000).toISOString()
    const recent = new Date(now - 1 * 86400000).toISOString()
    await logEntry(makeEntry({ prompt: 'old', timestamp: old }), logPath)
    await logEntry(makeEntry({ prompt: 'recent', timestamp: recent }), logPath)
    const entries = await readEntries(logPath, { days: 7 })
    assert.equal(entries.length, 1)
    assert.equal(entries[0].prompt, 'recent')
  })

  test('user filter matches exact username', async () => {
    const logPath = path.join(tmpDir, 'user.jsonl')
    await logEntry(makeEntry({ user: 'alice' }), logPath)
    await logEntry(makeEntry({ user: 'bob' }), logPath)
    await logEntry(makeEntry({ user: 'alice' }), logPath)
    const entries = await readEntries(logPath, { user: 'alice' })
    assert.equal(entries.length, 2)
    assert.ok(entries.every((e) => e.user === 'alice'))
  })

  test('logEntry never throws on broken path', async () => {
    // Should not throw — failure is silent by design
    await logEntry(makeEntry(), '/this/path/does/not/exist/and/cannot/be/created/audit.jsonl')
    assert.ok(true)
  })
})
