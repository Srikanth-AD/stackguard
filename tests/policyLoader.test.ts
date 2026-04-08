import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import { loadPolicy } from '../src/lib/policyLoader.ts'

let tmpDir: string

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-policy-'))
})

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

describe('policyLoader', () => {
  test('loads from local file and computes sha256', async () => {
    const content = '# Test policy\n\nNEVER use lodash.\n'
    const policyPath = path.join(tmpDir, 'policy.md')
    await fs.writeFile(policyPath, content, 'utf-8')

    const policy = await loadPolicy(policyPath)
    assert.equal(policy.content, content)
    assert.equal(policy.hash, sha256(content))
    assert.equal(policy.source, policyPath)
    assert.ok(policy.loadedAt)
  })

  test('hash matches when policyHash is correct', async () => {
    const content = 'something deterministic'
    const policyPath = path.join(tmpDir, 'p2.md')
    await fs.writeFile(policyPath, content, 'utf-8')
    const expected = `sha256:${sha256(content)}`

    const policy = await loadPolicy(policyPath, {
      policySource: policyPath,
      policyHash: expected,
    } as any)
    assert.equal(`sha256:${policy.hash}`, expected)
  })

  test('throws on missing local file', async () => {
    await assert.rejects(loadPolicy(path.join(tmpDir, 'nope.md')))
  })

  test('resolves relative paths from cwd', async () => {
    const content = 'relative-test'
    const subdir = path.join(tmpDir, 'rel')
    await fs.mkdir(subdir, { recursive: true })
    await fs.writeFile(path.join(subdir, 'p.md'), content, 'utf-8')

    const originalCwd = process.cwd()
    process.chdir(subdir)
    try {
      const policy = await loadPolicy('./p.md')
      assert.equal(policy.content, content)
    } finally {
      process.chdir(originalCwd)
    }
  })
})
