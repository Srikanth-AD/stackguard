import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { applyLowConfidenceOverride, extractJson } from '../src/lib/checker.ts'
import type { CheckResult } from '../src/types.ts'

describe('extractJson', () => {
  test('returns plain JSON unchanged', () => {
    const input = '{"passed":true,"violations":[]}'
    assert.equal(extractJson(input), input)
  })

  test('strips ```json fences', () => {
    const input = '```json\n{"passed":true}\n```'
    assert.equal(extractJson(input), '{"passed":true}')
  })

  test('strips bare ``` fences', () => {
    const input = '```\n{"passed":false}\n```'
    assert.equal(extractJson(input), '{"passed":false}')
  })

  test('extracts JSON from preamble + JSON', () => {
    const input = 'Here is the JSON you asked for:\n{"passed":true,"violations":[]}'
    assert.equal(extractJson(input), '{"passed":true,"violations":[]}')
  })

  test('handles nested braces', () => {
    const input = '{"outer":{"inner":"value"},"x":1}'
    assert.equal(extractJson(input), input)
  })

  test('trims whitespace', () => {
    const input = '   \n{"a":1}\n   '
    assert.equal(extractJson(input), '{"a":1}')
  })
})

describe('applyLowConfidenceOverride', () => {
  function makeResult(overrides: Partial<CheckResult> = {}): CheckResult {
    return {
      passed: false,
      violations: [],
      suggestedRevision: null,
      confidence: 'low',
      ...overrides,
    }
  }

  test('passes through results that already passed', () => {
    const r = makeResult({ passed: true })
    const out = applyLowConfidenceOverride(r)
    assert.equal(out.passed, true)
    assert.equal(out.lowConfidenceOnly, undefined)
  })

  test('flips passed=true when ALL violations are low-confidence', () => {
    const r = makeResult({
      passed: false,
      violations: [
        { quote: 'a', rule: 'r', explanation: 'e', confidence: 'low' },
        { quote: 'b', rule: 'r', explanation: 'e', confidence: 'low' },
      ],
    })
    const out = applyLowConfidenceOverride(r)
    assert.equal(out.passed, true)
    assert.equal(out.lowConfidenceOnly, true)
  })

  test('does NOT flip when any violation is medium', () => {
    const r = makeResult({
      passed: false,
      violations: [
        { quote: 'a', rule: 'r', explanation: 'e', confidence: 'low' },
        { quote: 'b', rule: 'r', explanation: 'e', confidence: 'medium' },
      ],
    })
    const out = applyLowConfidenceOverride(r)
    assert.equal(out.passed, false)
    assert.equal(out.lowConfidenceOnly, undefined)
  })

  test('does NOT flip when any violation is high', () => {
    const r = makeResult({
      passed: false,
      violations: [{ quote: 'a', rule: 'r', explanation: 'e', confidence: 'high' }],
    })
    const out = applyLowConfidenceOverride(r)
    assert.equal(out.passed, false)
  })

  test('does NOT flip when violations array is empty', () => {
    const r = makeResult({ passed: false, violations: [] })
    const out = applyLowConfidenceOverride(r)
    assert.equal(out.passed, false)
  })
})
