import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { formatRevisionBox, formatViolationLines, truncate, wrap } from '../src/lib/renderer.ts'
import type { Violation } from '../src/types.ts'

describe('truncate', () => {
  test('returns short strings unchanged', () => {
    assert.equal(truncate('hello', 10), 'hello')
  })

  test('returns exact-length strings unchanged', () => {
    assert.equal(truncate('hello', 5), 'hello')
  })

  test('truncates and appends ellipsis when too long', () => {
    const out = truncate('abcdefghij', 5)
    assert.equal(out, 'abcd…')
    assert.equal(out.length, 5)
  })

  test('handles n=1 (just the ellipsis)', () => {
    assert.equal(truncate('abcdef', 1), '…')
  })

  test('handles empty string', () => {
    assert.equal(truncate('', 5), '')
  })
})

describe('wrap', () => {
  test('returns a single line for short text', () => {
    assert.deepEqual(wrap('hello world', 80), ['hello world'])
  })

  test('wraps at the requested width', () => {
    const out = wrap('one two three four five six seven eight', 15)
    for (const line of out) {
      assert.ok(line.length <= 15, `line too long: "${line}" (${line.length})`)
    }
    // Words should still appear in order
    assert.equal(out.join(' '), 'one two three four five six seven eight')
  })

  test('places words longer than the width on their own line', () => {
    const out = wrap('hi superduperlongword bye', 5)
    // The long word should appear standalone — we never split inside a word
    assert.ok(out.includes('superduperlongword'))
  })

  test('collapses multiple whitespace runs', () => {
    const out = wrap('foo    bar     baz', 80)
    assert.deepEqual(out, ['foo bar baz'])
  })

  test('returns empty array for empty input', () => {
    assert.deepEqual(wrap('', 80), [])
  })

  test('returns empty array for whitespace-only input', () => {
    assert.deepEqual(wrap('   \n\t  ', 80), [])
  })
})

describe('formatViolationLines', () => {
  function makeViolation(overrides: Partial<Violation> = {}): Violation {
    return {
      quote: 'a banned thing',
      rule: 'never use the banned thing',
      explanation: 'the policy excludes this',
      confidence: 'high',
      ...overrides,
    }
  }

  test('includes the quote, rule, why, and level', () => {
    const lines = formatViolationLines(makeViolation(), 0, 1)
    const blob = lines.join('\n')
    assert.match(blob, /a banned thing/)
    assert.match(blob, /never use the banned thing/)
    assert.match(blob, /the policy excludes this/)
    assert.match(blob, /HIGH confidence/)
  })

  test('omits the (i/N) header when there is only one violation', () => {
    const lines = formatViolationLines(makeViolation(), 0, 1)
    const blob = lines.join('\n')
    assert.doesNotMatch(blob, /\(1\/1\)/)
  })

  test('includes (i/N) header when multiple violations', () => {
    const lines = formatViolationLines(makeViolation(), 1, 3)
    assert.equal(lines[0], '(2/3)')
  })

  test('truncates very long quotes to fit width', () => {
    const long = 'x'.repeat(200)
    const lines = formatViolationLines(makeViolation({ quote: long }), 0, 1)
    // First content line is the quoted text — wrap is `"…"` so total < width+2
    const quoteLine = lines.find((l) => l.startsWith('"'))!
    assert.ok(quoteLine.length <= 72, `quote line too long: ${quoteLine.length}`)
  })

  test('uppercases the confidence level', () => {
    const lines = formatViolationLines(makeViolation({ confidence: 'medium' }), 0, 1)
    assert.match(lines.join('\n'), /MEDIUM confidence/)
  })
})

describe('formatRevisionBox', () => {
  test('produces a box with header, top, content, and bottom', () => {
    const lines = formatRevisionBox('use the approved thing instead')
    assert.equal(lines[0], 'Suggested revision:')
    assert.match(lines[1], /^┌─+┐$/)
    assert.match(lines[lines.length - 1], /^└─+┘$/)
  })

  test('content lines are padded to a consistent width', () => {
    const lines = formatRevisionBox('one two three')
    const contentLines = lines.filter((l) => l.startsWith('│'))
    const widths = new Set(contentLines.map((l) => l.length))
    assert.equal(widths.size, 1, 'all content lines should be the same width')
  })

  test('long revisions wrap across multiple content lines', () => {
    const long =
      'add a Postgres-backed user_sessions table accessed via the team approved DB wrapper with parameterized queries'
    const lines = formatRevisionBox(long)
    const contentLines = lines.filter((l) => l.startsWith('│'))
    assert.ok(contentLines.length >= 2, 'long revision should wrap to 2+ lines')
  })

  test('top and bottom borders are the same width', () => {
    const lines = formatRevisionBox('short text')
    const top = lines[1]
    const bot = lines[lines.length - 1]
    assert.equal(top.length, bot.length)
  })
})
