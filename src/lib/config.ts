import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Config } from '../types.js'

const CONFIG_FILENAME = 'stackguard.json'

export async function findConfigPath(): Promise<string | null> {
  let dir = process.cwd()
  const root = path.parse(dir).root
  while (true) {
    const candidate = path.join(dir, CONFIG_FILENAME)
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // not found, walk up
    }
    if (dir === root) return null
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export async function loadConfig(): Promise<Config | null> {
  const configPath = await findConfigPath()
  let config: Partial<Config> = {}

  if (configPath) {
    try {
      const raw = await fs.readFile(configPath, 'utf-8')
      config = JSON.parse(raw)
    } catch {
      config = {}
    }
  }

  // Environment overrides
  if (process.env.ANTHROPIC_API_KEY) {
    config.anthropicApiKey = process.env.ANTHROPIC_API_KEY
  }
  if (process.env.STACKGUARD_MODE) {
    const m = process.env.STACKGUARD_MODE
    if (m === 'warn' || m === 'block') config.mode = m
  }
  if (process.env.STACKGUARD_POLICY) {
    config.policySource = process.env.STACKGUARD_POLICY
  }

  // Defaults
  if (!config.model) config.model = 'claude-haiku-4-5-20251001'
  if (!config.mode) config.mode = 'warn'
  if (config.logOverrides === undefined) config.logOverrides = true
  if (!config.logPath) config.logPath = '~/.stackguard/audit.jsonl'

  if (!configPath && !config.policySource) {
    return null
  }

  return config as Config
}

export async function writeConfig(filePath: string, config: Partial<Config>): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
}

export function expandHome(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1))
  }
  return p
}
