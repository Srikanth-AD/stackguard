import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import chalk from 'chalk'
import type { PolicyDocument, Config } from '../types.js'
import { expandHome } from './config.js'

const CACHE_DIR = path.join(os.homedir(), '.stackguard', 'cache')

let tipShown = false

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {
    // ignore
  }
}

async function fetchWithTimeout(url: string, ms: number): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

async function loadFromUrl(url: string): Promise<string> {
  const cacheKey = sha256(url)
  const cachePath = path.join(CACHE_DIR, cacheKey)
  await ensureDir(CACHE_DIR)

  try {
    const content = await fetchWithTimeout(url, 10_000)
    try {
      await fs.writeFile(cachePath, content, 'utf-8')
    } catch {
      // ignore cache write failures
    }
    return content
  } catch (err) {
    // Try cache fallback
    try {
      const cached = await fs.readFile(cachePath, 'utf-8')
      console.error(
        chalk.yellow(
          `⚠  stackguard: failed to fetch policy, using cached copy`
        )
      )
      return cached
    } catch {
      throw new Error(
        `Failed to fetch policy from ${url}: ${(err as Error).message}`
      )
    }
  }
}

async function loadFromFile(filePath: string): Promise<string> {
  const expanded = expandHome(filePath)
  const resolved = path.isAbsolute(expanded)
    ? expanded
    : path.resolve(process.cwd(), expanded)
  return fs.readFile(resolved, 'utf-8')
}

export async function loadPolicy(
  source: string,
  config?: Config
): Promise<PolicyDocument> {
  let content: string
  if (source.startsWith('https://')) {
    content = await loadFromUrl(source)
  } else {
    content = await loadFromFile(source)
  }

  const hash = sha256(content)
  const policy: PolicyDocument = {
    content,
    hash,
    source,
    loadedAt: new Date().toISOString(),
  }

  if (config?.policyHash) {
    const expected = config.policyHash.replace(/^sha256:/, '')
    if (expected !== hash) {
      console.error(
        chalk.red(`✗ stackguard: policy document hash mismatch`)
      )
      console.error(`Expected: ${config.policyHash}`)
      console.error(`Got:      sha256:${hash}`)
      console.error('')
      console.error('The policy may have been modified or is out of date.')
      console.error(
        'Contact your engineering manager to update the expected'
      )
      console.error('hash in stackguard.json.')
      process.exit(1)
    }
  } else if (!tipShown) {
    tipShown = true
    console.error(chalk.gray(`ℹ  Policy loaded: ${source}`))
    console.error(chalk.gray(`Hash: sha256:${hash}`))
    console.error(
      chalk.gray(
        `Tip: add "policyHash": "sha256:${hash}" to stackguard.json`
      )
    )
    console.error(
      chalk.gray(`to enforce document integrity across your team.`)
    )
  }

  return policy
}
