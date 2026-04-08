import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { addStackguardHook, removeStackguardHook } from '../src/commands/installHook.ts'

describe('addStackguardHook', () => {
  test('adds to empty settings', () => {
    const { settings, alreadyInstalled } = addStackguardHook({})
    assert.equal(alreadyInstalled, false)
    assert.ok(settings.hooks?.UserPromptSubmit)
    assert.equal(settings.hooks!.UserPromptSubmit!.length, 1)
    const handler = settings.hooks!.UserPromptSubmit![0].hooks?.[0]
    assert.equal(handler?.type, 'command')
    assert.equal(handler?.command, 'stackguard hook')
  })

  test('preserves unrelated top-level keys', () => {
    const input = { permissions: { allow: ['Read'] }, model: 'sonnet' }
    const { settings } = addStackguardHook(input as any)
    assert.deepEqual((settings as any).permissions, { allow: ['Read'] })
    assert.equal((settings as any).model, 'sonnet')
    assert.ok(settings.hooks?.UserPromptSubmit)
  })

  test('preserves unrelated hook events', () => {
    const input = {
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './pre.sh' }] }],
      },
    }
    const { settings } = addStackguardHook(input as any)
    assert.ok((settings.hooks as any).PreToolUse)
    assert.equal((settings.hooks as any).PreToolUse[0].hooks[0].command, './pre.sh')
    assert.ok(settings.hooks?.UserPromptSubmit)
  })

  test('preserves existing UserPromptSubmit hooks', () => {
    const input = {
      hooks: {
        UserPromptSubmit: [
          { matcher: '', hooks: [{ type: 'command', command: './my-other-hook.sh' }] },
        ],
      },
    }
    const { settings } = addStackguardHook(input as any)
    assert.equal(settings.hooks!.UserPromptSubmit!.length, 2)
    assert.equal(settings.hooks!.UserPromptSubmit![0].hooks?.[0].command, './my-other-hook.sh')
    assert.equal(settings.hooks!.UserPromptSubmit![1].hooks?.[0].command, 'stackguard hook')
  })

  test('is idempotent — second call detects existing install', () => {
    const first = addStackguardHook({})
    const second = addStackguardHook(first.settings)
    assert.equal(second.alreadyInstalled, true)
    assert.equal(second.settings.hooks!.UserPromptSubmit!.length, 1)
  })

  test('does not mutate the input object', () => {
    const input = { hooks: { UserPromptSubmit: [] as any[] } }
    const before = JSON.stringify(input)
    addStackguardHook(input as any)
    assert.equal(JSON.stringify(input), before)
  })
})

describe('removeStackguardHook', () => {
  test('removes a single stackguard entry and prunes empty group', () => {
    const input = addStackguardHook({}).settings
    const { settings, removed } = removeStackguardHook(input)
    assert.equal(removed, 1)
    assert.equal(settings.hooks, undefined)
  })

  test('preserves other handlers in the same group', () => {
    const input = {
      hooks: {
        UserPromptSubmit: [
          {
            matcher: '',
            hooks: [
              { type: 'command', command: 'stackguard hook' },
              { type: 'command', command: './other.sh' },
            ],
          },
        ],
      },
    }
    const { settings, removed } = removeStackguardHook(input as any)
    assert.equal(removed, 1)
    assert.equal(settings.hooks!.UserPromptSubmit!.length, 1)
    assert.equal(settings.hooks!.UserPromptSubmit![0].hooks!.length, 1)
    assert.equal(settings.hooks!.UserPromptSubmit![0].hooks![0].command, './other.sh')
  })

  test('preserves unrelated hook events', () => {
    const input = {
      hooks: {
        UserPromptSubmit: [
          { matcher: '', hooks: [{ type: 'command', command: 'stackguard hook' }] },
        ],
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './pre.sh' }] }],
      },
    }
    const { settings, removed } = removeStackguardHook(input as any)
    assert.equal(removed, 1)
    assert.equal((settings.hooks as any).PreToolUse[0].hooks[0].command, './pre.sh')
    assert.equal(settings.hooks!.UserPromptSubmit, undefined)
  })

  test('returns 0 removed when stackguard hook is not present', () => {
    const input = {
      hooks: {
        UserPromptSubmit: [
          { matcher: '', hooks: [{ type: 'command', command: './something-else.sh' }] },
        ],
      },
    }
    const { removed } = removeStackguardHook(input as any)
    assert.equal(removed, 0)
  })

  test('handles completely empty settings', () => {
    const { settings, removed } = removeStackguardHook({})
    assert.equal(removed, 0)
    assert.deepEqual(settings, {})
  })
})
