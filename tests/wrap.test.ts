import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { parseWrapArgs } from '../src/commands/wrap.ts'

describe('parseWrapArgs', () => {
  test('plain command without separator', () => {
    const r = parseWrapArgs(['claude', 'add a thing'])
    assert.equal(r.error, undefined)
    assert.deepEqual(r.args, ['claude', 'add a thing'])
    assert.equal(r.policy, undefined)
    assert.equal(r.mode, undefined)
  })

  test('command with explicit -- separator', () => {
    const r = parseWrapArgs(['--', 'claude', 'add a thing'])
    assert.equal(r.error, undefined)
    assert.deepEqual(r.args, ['claude', 'add a thing'])
  })

  test('--policy is consumed before the command', () => {
    const r = parseWrapArgs(['--policy', './p.md', '--', 'claude', 'prompt'])
    assert.equal(r.error, undefined)
    assert.equal(r.policy, './p.md')
    assert.deepEqual(r.args, ['claude', 'prompt'])
  })

  test('--mode is consumed before the command', () => {
    const r = parseWrapArgs(['--mode', 'block', '--', 'claude', 'prompt'])
    assert.equal(r.error, undefined)
    assert.equal(r.mode, 'block')
    assert.deepEqual(r.args, ['claude', 'prompt'])
  })

  test('--policy and --mode together', () => {
    const r = parseWrapArgs(['--policy', './p.md', '--mode', 'warn', '--', 'cursor', 'prompt'])
    assert.equal(r.policy, './p.md')
    assert.equal(r.mode, 'warn')
    assert.deepEqual(r.args, ['cursor', 'prompt'])
  })

  test('options that look like ours are passed through after the separator', () => {
    const r = parseWrapArgs(['--', 'claude', '--some-claude-flag', 'prompt'])
    assert.equal(r.error, undefined)
    assert.deepEqual(r.args, ['claude', '--some-claude-flag', 'prompt'])
  })

  test('options after the command (no explicit --) are passed through', () => {
    const r = parseWrapArgs(['claude', '--some-claude-flag', 'prompt'])
    assert.equal(r.error, undefined)
    assert.deepEqual(r.args, ['claude', '--some-claude-flag', 'prompt'])
  })

  test('reproduces the original bug: --claude without separator yields a clear error', () => {
    const r = parseWrapArgs(['--claude', 'add a thing'])
    assert.ok(r.error)
    assert.match(r.error!, /must not start with '-'/)
    assert.match(r.error!, /Did you forget the '--' separator/)
  })

  test('empty argv yields a clear error', () => {
    const r = parseWrapArgs([])
    assert.ok(r.error)
    assert.match(r.error!, /no command specified/)
  })

  test('only options, no command yields a clear error', () => {
    const r = parseWrapArgs(['--policy', './p.md'])
    assert.ok(r.error)
    assert.match(r.error!, /no command specified/)
  })

  test('--policy without value yields error', () => {
    const r = parseWrapArgs(['--policy'])
    assert.ok(r.error)
    assert.match(r.error!, /--policy requires a path/)
  })

  test('--policy followed by another option yields error', () => {
    const r = parseWrapArgs(['--policy', '--mode', 'warn', '--', 'claude'])
    assert.ok(r.error)
    assert.match(r.error!, /--policy requires a path/)
  })

  test('--mode with invalid value yields error', () => {
    const r = parseWrapArgs(['--mode', 'loud', '--', 'claude', 'prompt'])
    assert.ok(r.error)
    assert.match(r.error!, /--mode must be/)
  })

  test('--help sets help flag', () => {
    const r = parseWrapArgs(['--help'])
    assert.equal(r.help, true)
    assert.equal(r.error, undefined)
  })

  test('-h sets help flag', () => {
    const r = parseWrapArgs(['-h'])
    assert.equal(r.help, true)
  })

  test('command can have multiple positional args', () => {
    const r = parseWrapArgs(['--', 'cursor', 'agent', 'do', 'a', 'thing'])
    assert.deepEqual(r.args, ['cursor', 'agent', 'do', 'a', 'thing'])
  })
})
