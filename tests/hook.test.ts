import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  formatBlockMessage,
  formatLowConfidenceContext,
  parseHookPayload,
} from '../src/commands/hook.ts'
import type { CheckResult, Violation } from '../src/types.ts'

function makeViolation(overrides: Partial<Violation> = {}): Violation {
  return {
    quote: 'add a banned thing',
    rule: 'never use the banned thing',
    explanation: 'the policy excludes this technology',
    confidence: 'high',
    ...overrides,
  }
}

describe('formatBlockMessage', () => {
  test('includes header, all violations, and the next-step hint', () => {
    const result: CheckResult = {
      passed: false,
      violations: [makeViolation()],
      suggestedRevision: null,
      confidence: 'high',
    }
    const msg = formatBlockMessage(result)
    assert.match(msg, /✗ stackguard: prompt blocked/)
    assert.match(msg, /add a banned thing/)
    assert.match(msg, /never use the banned thing/)
    assert.match(msg, /HIGH confidence/)
    assert.match(msg, /Edit your prompt and submit again/)
  })

  test('includes the suggested revision when present', () => {
    const result: CheckResult = {
      passed: false,
      violations: [makeViolation()],
      suggestedRevision: 'use the approved thing instead',
      confidence: 'high',
    }
    const msg = formatBlockMessage(result)
    assert.match(msg, /Suggested revision:/)
    assert.match(msg, /use the approved thing instead/)
  })

  test('omits the suggested revision section when null', () => {
    const result: CheckResult = {
      passed: false,
      violations: [makeViolation()],
      suggestedRevision: null,
      confidence: 'high',
    }
    const msg = formatBlockMessage(result)
    assert.doesNotMatch(msg, /Suggested revision:/)
  })

  test('handles multiple violations', () => {
    const result: CheckResult = {
      passed: false,
      violations: [
        makeViolation({ quote: 'first thing' }),
        makeViolation({ quote: 'second thing', confidence: 'medium' }),
      ],
      suggestedRevision: null,
      confidence: 'high',
    }
    const msg = formatBlockMessage(result)
    assert.match(msg, /first thing/)
    assert.match(msg, /second thing/)
    assert.match(msg, /MEDIUM confidence/)
  })
})

describe('formatLowConfidenceContext', () => {
  test('produces a soft warning message with all violations', () => {
    const violations: Violation[] = [
      makeViolation({ quote: 'maybe-banned-thing', confidence: 'low' }),
      makeViolation({ quote: 'another-maybe', confidence: 'low' }),
    ]
    const msg = formatLowConfidenceContext(violations)
    assert.match(msg, /\[stackguard\]/)
    assert.match(msg, /low confidence — not blocking/)
    assert.match(msg, /maybe-banned-thing/)
    assert.match(msg, /another-maybe/)
  })
})

describe('parseHookPayload', () => {
  test('parses a well-formed envelope', () => {
    const raw = JSON.stringify({
      prompt: 'add a thing',
      cwd: '/tmp',
      session_id: 'abc',
      hook_event_name: 'UserPromptSubmit',
    })
    const out = parseHookPayload(raw)
    assert.ok(out)
    assert.equal(out!.prompt, 'add a thing')
    assert.equal(out!.cwd, '/tmp')
    assert.equal(out!.session_id, 'abc')
  })

  test('returns null for empty input', () => {
    assert.equal(parseHookPayload(''), null)
  })

  test('returns null for whitespace-only input', () => {
    assert.equal(parseHookPayload('   \n\t  '), null)
  })

  test('returns null for malformed JSON', () => {
    assert.equal(parseHookPayload('{not json'), null)
    assert.equal(parseHookPayload('not json at all'), null)
  })

  test('returns null when prompt field is missing', () => {
    const raw = JSON.stringify({ cwd: '/tmp', session_id: 'abc' })
    assert.equal(parseHookPayload(raw), null)
  })

  test('returns null when prompt is empty string', () => {
    const raw = JSON.stringify({ prompt: '', cwd: '/tmp' })
    assert.equal(parseHookPayload(raw), null)
  })

  test('returns null when prompt is whitespace only', () => {
    const raw = JSON.stringify({ prompt: '   \n  ', cwd: '/tmp' })
    assert.equal(parseHookPayload(raw), null)
  })

  test('returns null when prompt is not a string', () => {
    const raw = JSON.stringify({ prompt: 42, cwd: '/tmp' })
    assert.equal(parseHookPayload(raw), null)
  })

  test('returns null when payload is a JSON array', () => {
    assert.equal(parseHookPayload('[]'), null)
    assert.equal(parseHookPayload('["prompt"]'), null)
  })

  test('returns null when payload is a JSON primitive', () => {
    assert.equal(parseHookPayload('"just a string"'), null)
    assert.equal(parseHookPayload('42'), null)
    assert.equal(parseHookPayload('null'), null)
  })

  test('tolerates extra unknown fields', () => {
    const raw = JSON.stringify({
      prompt: 'add a thing',
      cwd: '/tmp',
      unknown_future_field: { nested: true },
    })
    const out = parseHookPayload(raw)
    assert.ok(out)
    assert.equal(out!.prompt, 'add a thing')
  })
})
